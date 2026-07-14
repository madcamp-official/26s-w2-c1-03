import { TripPlace } from '../schedule/entities/trip-place.entity';
import { ConflictResolutionService, ScheduleOpInput } from './conflict-resolution.service';

function buildTripPlace(overrides: Partial<TripPlace> = {}): TripPlace {
  return {
    id: 'tp-1',
    tripId: 'trip-1',
    dayNumber: 1,
    orderInDay: 2,
    startTime: '10:00',
    memo: '기존 메모',
    cost: null,
    updatedAt: new Date('2026-07-14T10:00:00Z'),
    ...overrides,
  } as TripPlace;
}

describe('ConflictResolutionService (Phase 10 낙관적 잠금)', () => {
  let tripPlaceRepository: { findOneBy: jest.Mock };
  let scheduleService: {
    addPlace: jest.Mock;
    updatePlace: jest.Mock;
    removePlace: jest.Mock;
  };
  let service: ConflictResolutionService;

  beforeEach(() => {
    tripPlaceRepository = { findOneBy: jest.fn() };
    scheduleService = {
      addPlace: jest.fn().mockResolvedValue({ tripPlace: {} }),
      updatePlace: jest.fn().mockResolvedValue({ tripPlace: {} }),
      removePlace: jest.fn().mockResolvedValue(undefined),
    };
    service = new ConflictResolutionService(
      tripPlaceRepository as never,
      scheduleService as never,
    );
  });

  describe('add', () => {
    it('ScheduleService.addPlace로 위임하고 applied를 반환한다', async () => {
      const op: ScheduleOpInput = {
        opId: 'op-1',
        type: 'add',
        placeId: 'place-1',
        dayNumber: 2,
        orderInDay: 1,
      };

      const outcome = await service.applyOp('trip-1', 'user-1', op);

      expect(outcome).toEqual({ status: 'applied' });
      expect(scheduleService.addPlace).toHaveBeenCalledWith(
        'trip-1',
        'user-1',
        expect.objectContaining({ placeId: 'place-1', dayNumber: 2, orderInDay: 1 }),
      );
    });

    it('dayNumber가 없으면 VALIDATION_ERROR를 던진다', async () => {
      await expect(
        service.applyOp('trip-1', 'user-1', { opId: 'op-1', type: 'add', placeId: 'p' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(scheduleService.addPlace).not.toHaveBeenCalled();
    });
  });

  describe('낙관적 잠금(§10.1: 먼저 온 변경이 이긴다)', () => {
    it('서버 updated_at이 baseUpdatedAt보다 새로우면 conflict + 서버 상태를 반환하고 적용하지 않는다', async () => {
      tripPlaceRepository.findOneBy.mockResolvedValue(
        buildTripPlace({ updatedAt: new Date('2026-07-14T10:05:00Z') }),
      );

      const outcome = await service.applyOp('trip-1', 'user-1', {
        opId: 'op-1',
        type: 'move',
        tripPlaceId: 'tp-1',
        dayNumber: 3,
        baseUpdatedAt: '2026-07-14T10:00:00Z', // 다른 멤버가 10:05에 먼저 수정
      });

      expect(outcome).toMatchObject({
        status: 'conflict',
        tripPlaceId: 'tp-1',
        serverState: expect.objectContaining({
          id: 'tp-1',
          dayNumber: 1,
          orderInDay: 2,
          updatedAt: '2026-07-14T10:05:00.000Z',
        }),
      });
      expect(scheduleService.updatePlace).not.toHaveBeenCalled();
    });

    it('baseUpdatedAt이 서버 updated_at 이상이면 stale이 아니므로 적용한다', async () => {
      tripPlaceRepository.findOneBy.mockResolvedValue(
        buildTripPlace({ updatedAt: new Date('2026-07-14T10:00:00Z') }),
      );

      const outcome = await service.applyOp('trip-1', 'user-1', {
        opId: 'op-1',
        type: 'move',
        tripPlaceId: 'tp-1',
        dayNumber: 3,
        orderInDay: 1,
        baseUpdatedAt: '2026-07-14T10:00:00Z',
      });

      expect(outcome).toEqual({ status: 'applied' });
      expect(scheduleService.updatePlace).toHaveBeenCalledWith('trip-1', 'user-1', 'tp-1', {
        dayNumber: 3,
        orderInDay: 1,
      });
    });

    it('baseUpdatedAt을 생략하면 잠금 검사 없이 적용한다', async () => {
      tripPlaceRepository.findOneBy.mockResolvedValue(buildTripPlace());

      const outcome = await service.applyOp('trip-1', 'user-1', {
        opId: 'op-1',
        type: 'remove',
        tripPlaceId: 'tp-1',
      });

      expect(outcome).toEqual({ status: 'applied' });
      expect(scheduleService.removePlace).toHaveBeenCalledWith('trip-1', 'user-1', 'tp-1');
    });

    it('다른 멤버가 이미 삭제한 항목이면 serverState=null인 conflict를 반환한다', async () => {
      tripPlaceRepository.findOneBy.mockResolvedValue(null);

      const outcome = await service.applyOp('trip-1', 'user-1', {
        opId: 'op-1',
        type: 'editMemo',
        tripPlaceId: 'tp-gone',
        memo: '새 메모',
      });

      expect(outcome).toEqual({ status: 'conflict', tripPlaceId: 'tp-gone', serverState: null });
      expect(scheduleService.updatePlace).not.toHaveBeenCalled();
    });

    it('baseUpdatedAt이 ISO 형식이 아니면 VALIDATION_ERROR를 던진다', async () => {
      tripPlaceRepository.findOneBy.mockResolvedValue(buildTripPlace());

      await expect(
        service.applyOp('trip-1', 'user-1', {
          opId: 'op-1',
          type: 'remove',
          tripPlaceId: 'tp-1',
          baseUpdatedAt: '어제쯤',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  describe('op별 유효성/위임', () => {
    it('editMemo는 memo(null 포함)를 updatePlace로 전달한다', async () => {
      tripPlaceRepository.findOneBy.mockResolvedValue(buildTripPlace());

      await service.applyOp('trip-1', 'user-1', {
        opId: 'op-1',
        type: 'editMemo',
        tripPlaceId: 'tp-1',
        memo: null, // null은 메모 삭제(§2.4)
      });

      expect(scheduleService.updatePlace).toHaveBeenCalledWith('trip-1', 'user-1', 'tp-1', {
        memo: null,
      });
    });

    it('move에 dayNumber/orderInDay가 모두 없으면 VALIDATION_ERROR를 던진다', async () => {
      tripPlaceRepository.findOneBy.mockResolvedValue(buildTripPlace());

      await expect(
        service.applyOp('trip-1', 'user-1', { opId: 'op-1', type: 'move', tripPlaceId: 'tp-1' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('tripPlaceId 없는 remove는 VALIDATION_ERROR를 던진다', async () => {
      await expect(
        service.applyOp('trip-1', 'user-1', { opId: 'op-1', type: 'remove' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('알 수 없는 type은 VALIDATION_ERROR를 던진다', async () => {
      await expect(
        service.applyOp('trip-1', 'user-1', {
          opId: 'op-1',
          type: 'explode' as ScheduleOpInput['type'],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('권한 없음 등 ScheduleService의 예외는 그대로 전파된다', async () => {
      tripPlaceRepository.findOneBy.mockResolvedValue(buildTripPlace());
      scheduleService.removePlace.mockRejectedValue(
        Object.assign(new Error('forbidden'), { code: 'TRIP_FORBIDDEN' }),
      );

      await expect(
        service.applyOp('trip-1', 'user-1', { opId: 'op-1', type: 'remove', tripPlaceId: 'tp-1' }),
      ).rejects.toMatchObject({ code: 'TRIP_FORBIDDEN' });
    });
  });
});
