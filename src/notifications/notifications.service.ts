import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../common/exceptions/business-exception';
import { Trip } from '../trips/entities/trip.entity';
import { TripsService } from '../trips/trips.service';
import { UsersService } from '../users/users.service';
import { NotificationLog, NotificationType } from './entities/notification-log.entity';
import { NotificationsErrorCode } from './exceptions/notifications-error-code';
import { PUSH_SENDER, PushSender } from './push-sender';

export interface EndTripBatchResult {
  /** 이번 배치에서 완료 처리된 여행 수 */
  completedTrips: number;
  /** 실제로 종료 알림을 새로 남긴 인원 수(멱등 스킵분 제외) */
  notifiedUsers: number;
}

/**
 * [now]를 한국 표준시(KST, UTC+9) 기준 날짜 문자열(YYYY-MM-DD)로 변환한다. 이 서비스는
 * 국내 여행만 다루므로(plan.md §16) "종료일 다음날"의 기준 시간대를 KST로 고정한다 —
 * 서버가 UTC로 돌아도 한국 자정을 기준으로 종료 여부를 판단한다.
 */
function toKstDateString(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * 여행 종료 감지 + 기록 유도 푸시(plan.md Phase 13, §1.4 step7). notifications는
 * 파생 도메인이라 자체 Entity(NotificationLog)만 직접 다루고, 여행/디바이스는
 * TripsService·UsersService를 통해서만 조회/전환한다(§3.1).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationLog)
    private readonly notificationLogRepository: Repository<NotificationLog>,
    private readonly tripsService: TripsService,
    private readonly usersService: UsersService,
    @Inject(PUSH_SENDER) private readonly pushSender: PushSender,
  ) {}

  /**
   * 종료일 "다음날"이 된 미완료 여행을 완료 처리하고, 멤버 각자에게 기록 유도 푸시를
   * 보낸다. 멱등하게 설계 — 이미 알림을 남긴 멤버는 건너뛰고, 한 여행의 모든 멤버
   * 처리가 끝난 뒤에야 status를 completed로 전환하므로, 중간 실패 시 다음 실행에서
   * 안전하게 재시도된다(먼저 completed로 바꿔버리면 재시도 대상에서 빠져 알림이 유실됨).
   */
  async runTripEndReminderBatch(now: Date = new Date()): Promise<EndTripBatchResult> {
    const today = toKstDateString(now);
    const endedTrips = await this.tripsService.findEndedActiveTrips(today);

    let completedTrips = 0;
    let notifiedUsers = 0;
    for (const trip of endedTrips) {
      try {
        notifiedUsers += await this.remindTripEnded(trip);
        await this.tripsService.markCompleted(trip.id);
        completedTrips += 1;
      } catch (error) {
        // 한 여행의 실패가 나머지를 막지 않도록 격리한다. status를 전환하지 않았으므로
        // 다음 배치에서 재시도된다.
        this.logger.error(
          `여행 종료 알림 처리 실패(tripId=${trip.id}): ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(
      `여행 종료 배치 완료 — 대상 ${endedTrips.length}건, 완료 전환 ${completedTrips}건, 알림 ${notifiedUsers}명`,
    );
    return { completedTrips, notifiedUsers };
  }

  /** 여행 한 건의 전체 멤버에게 종료 알림을 보낸다. 반환값은 실제로 알림을 새로 남긴 인원 수. */
  private async remindTripEnded(trip: Trip): Promise<number> {
    const userIds = await this.tripsService.findMemberUserIds(trip.id);
    let notified = 0;

    for (const userId of userIds) {
      // 멱등성: 이 여행에 대해 이미 종료 알림을 남긴 멤버는 건너뛴다(재시도 대비).
      const already = await this.notificationLogRepository.findOne({
        where: { userId, tripId: trip.id, type: NotificationType.TRIP_END_REMINDER },
      });
      if (already) {
        continue;
      }

      const log = await this.notificationLogRepository.save(
        this.notificationLogRepository.create({
          userId,
          tripId: trip.id,
          type: NotificationType.TRIP_END_REMINDER,
        }),
      );
      notified += 1;

      await this.pushToUser(userId, trip, log.id);
    }

    return notified;
  }

  /**
   * 유저의 활성 디바이스로 푸시 발송 + 무효 토큰 정리. 발송 실패는 삼켜서 알림 로그
   * 기록(engagement 추적용)이나 다른 멤버 처리를 되돌리지 않는다.
   */
  private async pushToUser(userId: string, trip: Trip, notificationId: string): Promise<void> {
    const tokens = await this.usersService.findActiveDeviceTokens(userId);
    if (tokens.length === 0) {
      return;
    }

    try {
      const result = await this.pushSender.send(tokens, {
        title: '여행이 끝났어요 ✈️',
        body: `'${trip.title}' 여행은 어땠나요? 사진으로 여행을 기록해보세요.`,
        data: {
          type: NotificationType.TRIP_END_REMINDER,
          tripId: trip.id,
          notificationId,
        },
      });
      await this.usersService.deactivateDeviceTokens(result.invalidTokens);
    } catch (error) {
      this.logger.warn(
        `푸시 발송 실패(userId=${userId}, tripId=${trip.id}): ${(error as Error).message}`,
      );
    }
  }

  /**
   * 사용자가 종료 알림을 클릭해 기록 작성을 시작한 시각을 기록한다(§4.7 clicked_at).
   * 본인 알림만 갱신 가능하며, 이미 클릭 시각이 있으면 최초 클릭 시각을 유지한다(멱등).
   */
  async markClicked(notificationId: string, userId: string): Promise<void> {
    const log = await this.notificationLogRepository.findOne({ where: { id: notificationId } });
    if (!log || log.userId !== userId) {
      throw new BusinessException(NotificationsErrorCode.NOTIFICATION_NOT_FOUND);
    }
    if (log.clickedAt) {
      return;
    }
    log.clickedAt = new Date();
    await this.notificationLogRepository.save(log);
  }
}
