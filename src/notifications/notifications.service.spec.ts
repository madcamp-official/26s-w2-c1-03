import { BusinessException } from '../common/exceptions/business-exception';
import { Trip, TripStatus } from '../trips/entities/trip.entity';
import { NotificationLog, NotificationType } from './entities/notification-log.entity';
import { NotificationsService } from './notifications.service';
import { PushSender } from './push-sender';

function buildTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1',
    title: '부산 여행',
    endDate: '2026-07-14',
    status: TripStatus.ONGOING,
    ...overrides,
  } as Trip;
}

describe('NotificationsService', () => {
  let logRepository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let tripsService: {
    findEndedActiveTrips: jest.Mock;
    markCompleted: jest.Mock;
    findMemberUserIds: jest.Mock;
  };
  let usersService: {
    findActiveDeviceTokens: jest.Mock;
    deactivateDeviceTokens: jest.Mock;
  };
  let pushSender: jest.Mocked<PushSender>;
  let service: NotificationsService;

  beforeEach(() => {
    let seq = 0;
    logRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((entity) => entity),
      save: jest.fn(async (entity) => ({ id: `log-${++seq}`, clickedAt: null, ...entity })),
    };
    tripsService = {
      findEndedActiveTrips: jest.fn().mockResolvedValue([]),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      findMemberUserIds: jest.fn().mockResolvedValue([]),
    };
    usersService = {
      findActiveDeviceTokens: jest.fn().mockResolvedValue([]),
      deactivateDeviceTokens: jest.fn().mockResolvedValue(undefined),
    };
    pushSender = {
      send: jest.fn().mockResolvedValue({ successCount: 0, failureCount: 0, invalidTokens: [] }),
    };
    service = new NotificationsService(
      logRepository as never,
      tripsService as never,
      usersService as never,
      pushSender as never,
    );
  });

  describe('runTripEndReminderBatch', () => {
    it('종료된 여행을 KST 기준 오늘 날짜로 조회한다', async () => {
      // 2026-07-15 16:00 UTC = 2026-07-16 01:00 KST → 오늘은 07-16
      await service.runTripEndReminderBatch(new Date('2026-07-15T16:00:00Z'));
      expect(tripsService.findEndedActiveTrips).toHaveBeenCalledWith('2026-07-16');
    });

    it('멤버 각자에게 알림 로그를 남기고 푸시를 보낸 뒤 여행을 완료 처리한다', async () => {
      tripsService.findEndedActiveTrips.mockResolvedValue([buildTrip()]);
      tripsService.findMemberUserIds.mockResolvedValue(['user-a', 'user-b']);
      usersService.findActiveDeviceTokens.mockResolvedValue(['tok-1']);

      const result = await service.runTripEndReminderBatch(new Date('2026-07-16T00:00:00Z'));

      expect(logRepository.save).toHaveBeenCalledTimes(2);
      expect(logRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tripId: 'trip-1',
          type: NotificationType.TRIP_END_REMINDER,
        }),
      );
      expect(pushSender.send).toHaveBeenCalledTimes(2);
      expect(tripsService.markCompleted).toHaveBeenCalledWith('trip-1');
      expect(result).toEqual({ completedTrips: 1, notifiedUsers: 2 });
    });

    it('이미 종료 알림을 받은 멤버는 건너뛴다(멱등)', async () => {
      tripsService.findEndedActiveTrips.mockResolvedValue([buildTrip()]);
      tripsService.findMemberUserIds.mockResolvedValue(['user-a', 'user-b']);
      // user-a는 이미 로그가 있음
      logRepository.findOne.mockImplementation(async ({ where }) =>
        where.userId === 'user-a' ? ({ id: 'existing' } as NotificationLog) : null,
      );

      const result = await service.runTripEndReminderBatch(new Date('2026-07-16T00:00:00Z'));

      expect(logRepository.save).toHaveBeenCalledTimes(1); // user-b만
      expect(result.notifiedUsers).toBe(1);
      expect(tripsService.markCompleted).toHaveBeenCalledWith('trip-1'); // 그래도 완료 전환
    });

    it('디바이스가 없는 멤버는 로그만 남기고 푸시는 보내지 않는다', async () => {
      tripsService.findEndedActiveTrips.mockResolvedValue([buildTrip()]);
      tripsService.findMemberUserIds.mockResolvedValue(['user-a']);
      usersService.findActiveDeviceTokens.mockResolvedValue([]);

      await service.runTripEndReminderBatch(new Date('2026-07-16T00:00:00Z'));

      expect(logRepository.save).toHaveBeenCalledTimes(1);
      expect(pushSender.send).not.toHaveBeenCalled();
    });

    it('FCM이 무효라고 응답한 토큰은 비활성화한다', async () => {
      tripsService.findEndedActiveTrips.mockResolvedValue([buildTrip()]);
      tripsService.findMemberUserIds.mockResolvedValue(['user-a']);
      usersService.findActiveDeviceTokens.mockResolvedValue(['tok-good', 'tok-dead']);
      pushSender.send.mockResolvedValue({
        successCount: 1,
        failureCount: 1,
        invalidTokens: ['tok-dead'],
      });

      await service.runTripEndReminderBatch(new Date('2026-07-16T00:00:00Z'));

      expect(usersService.deactivateDeviceTokens).toHaveBeenCalledWith(['tok-dead']);
    });

    it('한 여행 처리가 실패해도 완료 전환하지 않고 다음 여행은 계속 처리한다', async () => {
      tripsService.findEndedActiveTrips.mockResolvedValue([
        buildTrip({ id: 'trip-fail' }),
        buildTrip({ id: 'trip-ok' }),
      ]);
      tripsService.findMemberUserIds.mockResolvedValue(['user-a']);
      // 첫 여행의 로그 저장이 실패
      logRepository.save
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValue({ id: 'log-x', clickedAt: null });

      const result = await service.runTripEndReminderBatch(new Date('2026-07-16T00:00:00Z'));

      expect(tripsService.markCompleted).not.toHaveBeenCalledWith('trip-fail');
      expect(tripsService.markCompleted).toHaveBeenCalledWith('trip-ok');
      expect(result.completedTrips).toBe(1);
    });

    it('푸시 발송 자체가 예외를 던져도 알림 로그와 완료 전환은 유지된다', async () => {
      tripsService.findEndedActiveTrips.mockResolvedValue([buildTrip()]);
      tripsService.findMemberUserIds.mockResolvedValue(['user-a']);
      usersService.findActiveDeviceTokens.mockResolvedValue(['tok-1']);
      pushSender.send.mockRejectedValue(new Error('fcm unavailable'));

      const result = await service.runTripEndReminderBatch(new Date('2026-07-16T00:00:00Z'));

      expect(logRepository.save).toHaveBeenCalledTimes(1);
      expect(tripsService.markCompleted).toHaveBeenCalledWith('trip-1');
      expect(result.notifiedUsers).toBe(1);
    });
  });

  describe('markClicked', () => {
    it('본인 알림이면 clickedAt을 기록한다', async () => {
      logRepository.findOne.mockResolvedValue({ id: 'n-1', userId: 'user-a', clickedAt: null });

      await service.markClicked('n-1', 'user-a');

      expect(logRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'n-1', clickedAt: expect.any(Date) }),
      );
    });

    it('이미 클릭된 알림은 최초 시각을 유지한다(멱등, 저장 안 함)', async () => {
      const clickedAt = new Date('2026-07-16T02:00:00Z');
      logRepository.findOne.mockResolvedValue({ id: 'n-1', userId: 'user-a', clickedAt });

      await service.markClicked('n-1', 'user-a');

      expect(logRepository.save).not.toHaveBeenCalled();
    });

    it('없는 알림이면 NOTIFICATION_NOT_FOUND를 던진다', async () => {
      logRepository.findOne.mockResolvedValue(null);
      await expect(service.markClicked('missing', 'user-a')).rejects.toBeInstanceOf(
        BusinessException,
      );
    });

    it('다른 사람의 알림이면 NOTIFICATION_NOT_FOUND를 던진다', async () => {
      logRepository.findOne.mockResolvedValue({ id: 'n-1', userId: 'user-b', clickedAt: null });
      await expect(service.markClicked('n-1', 'user-a')).rejects.toBeInstanceOf(BusinessException);
    });
  });
});
