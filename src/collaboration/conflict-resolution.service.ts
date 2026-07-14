import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../common/exceptions/business-exception';
import { CommonErrorCode } from '../common/exceptions/error-code';
import { TripPlace } from '../schedule/entities/trip-place.entity';
import { ScheduleService } from '../schedule/schedule.service';

/** API 명세서 §3.2 schedule:op payload(+ 낙관적 잠금 기준 baseUpdatedAt 확장 필드). */
export interface ScheduleOpInput {
  opId: string;
  type: 'add' | 'remove' | 'move' | 'editMemo';
  tripPlaceId?: string;
  dayNumber?: number;
  orderInDay?: number;
  memo?: string | null;
  /** add 경로 입력(§2.4 AddSchedulePlaceDto와 동일한 두 갈래). */
  placeId?: string;
  customName?: string;
  customAddress?: string;
  /**
   * 클라이언트가 마지막으로 본 해당 tripPlace의 updated_at(ISO). 서버 값이 이보다
   * 새로우면 다른 멤버가 먼저 수정한 것 — stale 변경으로 거부한다(§10.1 낙관적 잠금).
   * 생략하면 잠금 검사 없이 적용한다(후발 주자 우선).
   */
  baseUpdatedAt?: string;
}

/** 충돌 시 클라이언트에 강제 전달할 서버 최신 상태. null이면 이미 삭제된 항목. */
export interface ConflictServerState {
  id: string;
  dayNumber: number;
  orderInDay: number;
  memo: string | null;
  startTime: string | null;
  updatedAt: string;
}

export type ScheduleOpOutcome =
  | { status: 'applied' }
  | { status: 'conflict'; tripPlaceId: string; serverState: ConflictServerState | null };

/**
 * schedule:op를 검증·적용하는 서비스(plan.md §3.2의 conflict-resolution.service.ts).
 * 실제 데이터 변경은 Phase 9 ScheduleService의 REST용 메서드를 그대로 재사용하고,
 * 여기서는 낙관적 잠금(선착 우선, stale 거부)만 앞단에서 판정한다 — REST와 WS가
 * 같은 검증(권한/일자 범위)과 같은 순번 재부여 로직을 타게 하기 위함이다.
 */
@Injectable()
export class ConflictResolutionService {
  constructor(
    @InjectRepository(TripPlace) private readonly tripPlaceRepository: Repository<TripPlace>,
    private readonly scheduleService: ScheduleService,
  ) {}

  async applyOp(tripId: string, userId: string, op: ScheduleOpInput): Promise<ScheduleOpOutcome> {
    switch (op.type) {
      case 'add':
        return this.applyAdd(tripId, userId, op);
      case 'remove':
      case 'move':
      case 'editMemo':
        return this.applyMutation(tripId, userId, op);
      default:
        throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, '지원하지 않는 op type입니다.');
    }
  }

  private async applyAdd(
    tripId: string,
    userId: string,
    op: ScheduleOpInput,
  ): Promise<ScheduleOpOutcome> {
    if (op.dayNumber === undefined) {
      throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, 'add에는 dayNumber가 필요합니다.');
    }
    await this.scheduleService.addPlace(tripId, userId, {
      placeId: op.placeId,
      customName: op.customName,
      customAddress: op.customAddress,
      dayNumber: op.dayNumber,
      orderInDay: op.orderInDay,
      memo: op.memo ?? undefined,
    });
    return { status: 'applied' };
  }

  private async applyMutation(
    tripId: string,
    userId: string,
    op: ScheduleOpInput,
  ): Promise<ScheduleOpOutcome> {
    const tripPlaceId = op.tripPlaceId;
    if (!tripPlaceId) {
      throw new BusinessException(
        CommonErrorCode.VALIDATION_ERROR,
        `${op.type}에는 tripPlaceId가 필요합니다.`,
      );
    }

    const current = await this.tripPlaceRepository.findOneBy({ id: tripPlaceId, tripId });
    if (!current) {
      // 다른 멤버가 이미 삭제한 항목 — serverState=null로 알려 클라이언트가 로컬에서 지우게 한다.
      return { status: 'conflict', tripPlaceId, serverState: null };
    }
    if (this.isStale(current, op.baseUpdatedAt)) {
      return { status: 'conflict', tripPlaceId, serverState: this.toServerState(current) };
    }

    if (op.type === 'remove') {
      await this.scheduleService.removePlace(tripId, userId, tripPlaceId);
    } else if (op.type === 'move') {
      if (op.dayNumber === undefined && op.orderInDay === undefined) {
        throw new BusinessException(
          CommonErrorCode.VALIDATION_ERROR,
          'move에는 dayNumber 또는 orderInDay가 필요합니다.',
        );
      }
      await this.scheduleService.updatePlace(tripId, userId, tripPlaceId, {
        dayNumber: op.dayNumber,
        orderInDay: op.orderInDay,
      });
    } else {
      await this.scheduleService.updatePlace(tripId, userId, tripPlaceId, { memo: op.memo });
    }
    return { status: 'applied' };
  }

  /** 서버 updated_at이 클라이언트 기준보다 새로우면 stale(먼저 온 변경이 이긴다, §10.1). */
  private isStale(current: TripPlace, baseUpdatedAt?: string): boolean {
    if (!baseUpdatedAt) {
      return false;
    }
    const base = Date.parse(baseUpdatedAt);
    if (Number.isNaN(base)) {
      throw new BusinessException(
        CommonErrorCode.VALIDATION_ERROR,
        'baseUpdatedAt은 ISO 날짜 문자열이어야 합니다.',
      );
    }
    return current.updatedAt.getTime() > base;
  }

  private toServerState(row: TripPlace): ConflictServerState {
    return {
      id: row.id,
      dayNumber: row.dayNumber,
      orderInDay: row.orderInDay,
      memo: row.memo,
      startTime: row.startTime,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
