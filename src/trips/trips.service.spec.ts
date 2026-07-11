import { DataSource } from 'typeorm';
import { TripMember, TripMemberRole } from './entities/trip-member.entity';
import { Trip, TripStatus } from './entities/trip.entity';
import { TripsService } from './trips.service';

type RepoMock<T extends object> = {
  [K in keyof import('typeorm').Repository<T>]?: jest.Mock;
};

function createRepositoryMock<T extends object>(): RepoMock<T> {
  return {
    create: jest.fn((entity) => entity),
    save: jest.fn(async (entity) => entity),
    findOneBy: jest.fn(),
    update: jest.fn(),
  };
}

function buildTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1',
    ownerId: 'user-1',
    owner: undefined as never,
    title: '오사카 여행',
    cityName: '오사카',
    areaCode: null,
    sigunguCode: null,
    startDate: '2026-07-15',
    endDate: '2026-07-19',
    status: TripStatus.PLANNING,
    coverImageUrl: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    members: [],
    inviteLinks: [],
    ...overrides,
  };
}

describe('TripsService', () => {
  let tripRepository: RepoMock<Trip>;
  let tripMemberRepository: RepoMock<TripMember>;
  let dataSource: { transaction: jest.Mock };
  let service: TripsService;

  beforeEach(() => {
    tripRepository = createRepositoryMock<Trip>();
    tripMemberRepository = createRepositoryMock<TripMember>();
    dataSource = { transaction: jest.fn() };

    service = new TripsService(
      tripRepository as never,
      tripMemberRepository as never,
      dataSource as unknown as DataSource,
    );
  });

  describe('create', () => {
    it('startDate가 endDate보다 늦으면 VALIDATION_ERROR를 던지고 트랜잭션을 시작하지 않는다', async () => {
      await expect(
        service.create('user-1', {
          title: '오사카 여행',
          cityName: '오사카',
          startDate: '2026-07-19',
          endDate: '2026-07-15',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('트랜잭션 안에서 Trip과 owner TripMember를 함께 생성한다', async () => {
      const manager = {
        create: jest.fn((_entityClass, data) => data),
        save: jest.fn(async (data) => {
          if (data.tripId) {
            return { id: 'member-1', ...data };
          }
          return { ...buildTrip(), ...data, id: 'trip-1' };
        }),
      };
      dataSource.transaction.mockImplementation(async (cb) => cb(manager));

      const result = await service.create('user-1', {
        title: '오사카 여행',
        cityName: '오사카',
        startDate: '2026-07-15',
        endDate: '2026-07-19',
      });

      expect(result.id).toBe('trip-1');
      expect(result.ownerId).toBe('user-1');
      expect(manager.save).toHaveBeenCalledTimes(2);
      const memberSaveCall = manager.save.mock.calls.find((call) => call[0]?.tripId);
      expect(memberSaveCall?.[0]).toMatchObject({
        tripId: 'trip-1',
        userId: 'user-1',
        role: TripMemberRole.OWNER,
      });
    });
  });

  describe('getDetail', () => {
    it('트립이 없으면 TRIP_NOT_FOUND를 던진다', async () => {
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(null);

      await expect(service.getDetail('trip-1', 'user-1')).rejects.toMatchObject({
        code: 'TRIP_NOT_FOUND',
      });
    });

    it('트립은 있지만 멤버가 아니면 TRIP_FORBIDDEN을 던진다', async () => {
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(buildTrip());
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue(null);

      await expect(service.getDetail('trip-1', 'stranger')).rejects.toMatchObject({
        code: 'TRIP_FORBIDDEN',
      });
    });

    it('멤버면 트립 요약을 반환한다', async () => {
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(buildTrip());
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.VIEWER,
      });

      const result = await service.getDetail('trip-1', 'user-2');
      expect(result.id).toBe('trip-1');
    });
  });

  describe('update', () => {
    it('viewer 역할이면 TRIP_FORBIDDEN을 던진다', async () => {
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(buildTrip());
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.VIEWER,
      });

      await expect(service.update('trip-1', 'user-2', { title: '새 제목' })).rejects.toMatchObject({
        code: 'TRIP_FORBIDDEN',
      });
    });

    it('editor 역할이면 title을 수정할 수 있다', async () => {
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(buildTrip());
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.EDITOR,
      });

      const result = await service.update('trip-1', 'user-2', { title: '새 제목' });
      expect(result.title).toBe('새 제목');
    });

    it('수정 후 날짜 범위가 뒤집히면 VALIDATION_ERROR를 던진다', async () => {
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(buildTrip());
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.OWNER,
      });

      await expect(
        service.update('trip-1', 'user-1', { startDate: '2026-08-01' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  describe('remove', () => {
    it('owner가 아니면 TRIP_FORBIDDEN을 던지고 삭제하지 않는다', async () => {
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(buildTrip());
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.EDITOR,
      });

      await expect(service.remove('trip-1', 'user-2')).rejects.toMatchObject({
        code: 'TRIP_FORBIDDEN',
      });
      expect(tripRepository.update).not.toHaveBeenCalled();
    });

    it('owner면 soft delete(update deletedAt)를 수행한다', async () => {
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(buildTrip());
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.OWNER,
      });

      await service.remove('trip-1', 'user-1');

      expect(tripRepository.update).toHaveBeenCalledWith(
        { id: 'trip-1' },
        expect.objectContaining({ deletedAt: expect.any(Date) }),
      );
    });
  });

  describe('assertMember', () => {
    it('허용된 역할 목록에 없으면 TRIP_FORBIDDEN을 던진다', async () => {
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.VIEWER,
      });

      await expect(
        service.assertMember('trip-1', 'user-1', [TripMemberRole.OWNER]),
      ).rejects.toMatchObject({ code: 'TRIP_FORBIDDEN' });
    });

    it('허용된 역할이면 member를 반환한다', async () => {
      const member = { role: TripMemberRole.OWNER };
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue(member);

      const result = await service.assertMember('trip-1', 'user-1', [TripMemberRole.OWNER]);
      expect(result).toBe(member);
    });
  });
});
