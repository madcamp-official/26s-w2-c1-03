import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { BusinessException } from '../common/exceptions/business-exception';
import { TripsService } from '../trips/trips.service';
import { ConflictResolutionService, ScheduleOpInput } from './conflict-resolution.service';

/**
 * API 명세서 §0/§3.2: 미소속/토큰 만료 시 4403으로 close. Socket.IO는 원시 WS
 * close 코드를 앱이 직접 지정할 수 없으므로, 끊기 직전에 이 코드를 payload로
 * 담은 `connection:rejected` 이벤트를 보내는 것으로 대체한다(클라이언트는 이
 * 이벤트를 받으면 재연결하지 않아야 한다).
 */
export const WS_FORBIDDEN_CODE = 4403;

interface TripSocketData {
  userId: string;
  tripId: string;
}

/**
 * 공동 편집 실시간 동기화 Gateway(plan.md Phase 10, §3.2). 자체 Entity 없이
 * 연결 인증(JWT + trip_members 소속)과 여행별 room 브로드캐스트만 담당한다.
 * 클라이언트는 Socket.IO로 `/ws/trips` 네임스페이스에 접속하며, handshake의
 * `auth.token`(또는 query `token`)과 query `tripId`를 함께 보낸다.
 */
@WebSocketGateway({ namespace: 'ws/trips', cors: { origin: true } })
export class CollaborationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(CollaborationGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tripsService: TripsService,
    private readonly conflictResolutionService: ConflictResolutionService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const tripId = this.firstValue(socket.handshake.query.tripId);
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        this.firstValue(socket.handshake.query.token);
      if (!tripId || !token) {
        throw new Error('tripId/token 누락');
      }

      const payload = await this.jwtService.verifyAsync<{ userId: string }>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      // viewer도 조회(수신)는 허용 — 역할 제한 없이 소속만 검증한다(§3.1과 동일 기준).
      await this.tripsService.assertMember(tripId, payload.userId);

      socket.data = { userId: payload.userId, tripId } satisfies TripSocketData;
      await socket.join(this.roomOf(tripId));
    } catch {
      // 사유 불문(토큰 만료/변조, 미소속, 파라미터 누락) 4403 통지 후 즉시 끊는다.
      socket.emit('connection:rejected', { code: WS_FORBIDDEN_CODE });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    // room 정리는 Socket.IO가 자동으로 한다. presence(member:left) 브로드캐스트는
    // REST 탈퇴/추방과 연결이 끊긴 것을 구분해야 하므로 여기서 하지 않는다(§3.2의
    // member:left는 멤버십 종료 이벤트 — TripsService 훅에서 발생시킨다).
  }

  /** 접속 유지 확인(§3.2). Socket.IO ack 콜백으로 응답한다. */
  @SubscribeMessage('presence:ping')
  handlePresencePing(): { ok: true } {
    return { ok: true };
  }

  /**
   * 편집 동작 수신(§3.2). 적용에 성공하면 같은 여행의 다른 참여자에게 authorUserId를
   * 붙여 그대로 전파하고, 낙관적 잠금에 걸리면(다른 멤버가 먼저 수정/삭제) 요청자에게만
   * schedule:conflict로 서버 최신 상태를 강제 전달한다(§10.1). ack로 결과를 돌려주므로
   * 클라이언트는 실패를 조용히 놓치지 않는다.
   */
  @SubscribeMessage('schedule:op')
  async handleScheduleOp(
    @ConnectedSocket() socket: Socket,
    @MessageBody() op: ScheduleOpInput,
  ): Promise<{ ok: boolean; conflict?: boolean; errorCode?: string }> {
    const { userId, tripId } = socket.data as TripSocketData;
    try {
      const outcome = await this.conflictResolutionService.applyOp(tripId, userId, op);
      if (outcome.status === 'conflict') {
        socket.emit('schedule:conflict', {
          tripPlaceId: outcome.tripPlaceId,
          serverState: outcome.serverState,
        });
        return { ok: false, conflict: true };
      }
      this.broadcastToTrip(tripId, 'schedule:op', { ...op, authorUserId: userId }, socket.id);
      return { ok: true };
    } catch (error) {
      // 검증 실패(권한/유효성)는 연결을 끊을 일이 아니다 — ack로만 알린다.
      const errorCode = error instanceof BusinessException ? error.code : 'INTERNAL_SERVER_ERROR';
      this.logger.warn(`schedule:op 실패(trip=${tripId}, type=${op?.type}): ${errorCode}`);
      return { ok: false, errorCode };
    }
  }

  /**
   * 같은 여행 room의 다른 참여자들에게 이벤트를 보낸다. exceptSocketId를 주면
   * 그 소켓(보통 변경을 일으킨 본인)은 제외한다. REST 흐름(TripsService 등)에서도
   * 호출되므로 서버 미기동(테스트) 상태를 방어한다.
   */
  broadcastToTrip(tripId: string, event: string, payload: unknown, exceptSocketId?: string): void {
    if (!this.server) {
      return;
    }
    const room = this.server.to(this.roomOf(tripId));
    const target = exceptSocketId ? room.except(exceptSocketId) : room;
    target.emit(event, payload);
    this.logger.debug(`broadcast ${event} → trip ${tripId}`);
  }

  private roomOf(tripId: string): string {
    return `trip:${tripId}`;
  }

  private firstValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
