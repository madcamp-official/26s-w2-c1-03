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
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    countBy: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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
  let inviteLinkRepository: RepoMock<import('./entities/trip-invite-link.entity').TripInviteLink>;
  let dataSource: { transaction: jest.Mock };
  let configService: { get: jest.Mock };
  let service: TripsService;

  beforeEach(() => {
    tripRepository = createRepositoryMock<Trip>();
    tripMemberRepository = createRepositoryMock<TripMember>();
    inviteLinkRepository = createRepositoryMock();
    dataSource = { transaction: jest.fn() };
    configService = { get: jest.fn((_key, defaultValue) => defaultValue) };

    service = new TripsService(
      tripRepository as never,
      tripMemberRepository as never,
      inviteLinkRepository as never,
      dataSource as unknown as DataSource,
      configService as never,
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

  describe('setCoverImage', () => {
    it('coverImageUrl을 갱신한다', async () => {
      await service.setCoverImage('trip-1', 'https://storage.example/photo.jpg');

      expect(tripRepository.update).toHaveBeenCalledWith(
        { id: 'trip-1' },
        { coverImageUrl: 'https://storage.example/photo.jpg' },
      );
    });

    it('null을 넘기면 대표사진을 해제한다', async () => {
      await service.setCoverImage('trip-1', null);

      expect(tripRepository.update).toHaveBeenCalledWith({ id: 'trip-1' }, { coverImageUrl: null });
    });
  });

  // ── Phase 10: 초대 링크 ─────────────────────────────────────────────

  describe('createInviteLink', () => {
    beforeEach(() => {
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(buildTrip());
    });

    it('viewer 역할이면 TRIP_FORBIDDEN을 던지고 링크를 만들지 않는다', async () => {
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.VIEWER,
      });

      await expect(service.createInviteLink('trip-1', 'user-2', {})).rejects.toMatchObject({
        code: 'TRIP_FORBIDDEN',
      });
      expect(inviteLinkRepository.save).not.toHaveBeenCalled();
    });

    it('editor면 토큰/딥링크 url을 생성하고, expiresInHours 생략 시 만료 없음', async () => {
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.EDITOR,
      });

      const result = await service.createInviteLink('trip-1', 'user-2', {});

      expect(result.token).toHaveLength(43); // 32바이트 base64url
      expect(result.url).toBe(`tripandend://join?token=${result.token}`);
      expect(result.expiresAt).toBeNull();
      expect(inviteLinkRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ tripId: 'trip-1', createdBy: 'user-2', expiresAt: null }),
      );
    });

    it('expiresInHours를 지정하면 그 시간만큼 뒤로 expiresAt이 설정된다', async () => {
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.OWNER,
      });

      const before = Date.now();
      const result = await service.createInviteLink('trip-1', 'user-1', { expiresInHours: 24 });
      const after = Date.now();

      const expiresAtMs = new Date(result.expiresAt as string).getTime();
      expect(expiresAtMs).toBeGreaterThanOrEqual(before + 24 * 3600 * 1000);
      expect(expiresAtMs).toBeLessThanOrEqual(after + 24 * 3600 * 1000);
    });
  });

  describe('joinByToken', () => {
    it('존재하지 않는 토큰이면 INVITE_LINK_NOT_FOUND를 던진다', async () => {
      (inviteLinkRepository.findOneBy as jest.Mock).mockResolvedValue(null);

      await expect(service.joinByToken('no-such-token', 'user-2')).rejects.toMatchObject({
        code: 'INVITE_LINK_NOT_FOUND',
      });
    });

    it('만료된 토큰이면 INVITE_LINK_EXPIRED를 던진다', async () => {
      (inviteLinkRepository.findOneBy as jest.Mock).mockResolvedValue({
        tripId: 'trip-1',
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.joinByToken('expired-token', 'user-2')).rejects.toMatchObject({
        code: 'INVITE_LINK_EXPIRED',
      });
    });

    it('삭제된 여행의 링크면 TRIP_NOT_FOUND를 던진다', async () => {
      (inviteLinkRepository.findOneBy as jest.Mock).mockResolvedValue({
        tripId: 'trip-1',
        expiresAt: null,
      });
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(null);

      await expect(service.joinByToken('token', 'user-2')).rejects.toMatchObject({
        code: 'TRIP_NOT_FOUND',
      });
    });

    it('이미 멤버면 insert 없이 tripId만 반환한다(멱등)', async () => {
      (inviteLinkRepository.findOneBy as jest.Mock).mockResolvedValue({
        tripId: 'trip-1',
        expiresAt: null,
      });
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(buildTrip());
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.EDITOR,
      });

      const result = await service.joinByToken('token', 'user-2');

      expect(result).toEqual({ tripId: 'trip-1' });
      expect(tripMemberRepository.save).not.toHaveBeenCalled();
    });

    it('신규 참여자는 role=editor로 등록된다', async () => {
      (inviteLinkRepository.findOneBy as jest.Mock).mockResolvedValue({
        tripId: 'trip-1',
        expiresAt: null,
      });
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(buildTrip());
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue(null);

      const result = await service.joinByToken('token', 'user-2');

      expect(result).toEqual({ tripId: 'trip-1' });
      expect(tripMemberRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tripId: 'trip-1',
          userId: 'user-2',
          role: TripMemberRole.EDITOR,
        }),
      );
    });
  });

  // ── Phase 10: 멤버 관리 ─────────────────────────────────────────────

  function buildMember(overrides: Partial<TripMember> = {}): TripMember {
    return {
      id: 'member-1',
      tripId: 'trip-1',
      trip: undefined as never,
      userId: 'user-2',
      user: { nickname: '지우', profileImageUrl: null } as never,
      role: TripMemberRole.EDITOR,
      joinedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  describe('listMembers', () => {
    it('멤버가 아니면 TRIP_FORBIDDEN을 던진다', async () => {
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(buildTrip());
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue(null);

      await expect(service.listMembers('trip-1', 'stranger')).rejects.toMatchObject({
        code: 'TRIP_FORBIDDEN',
      });
    });

    it('viewer도 조회할 수 있고 닉네임/역할이 매핑된다', async () => {
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(buildTrip());
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.VIEWER,
      });
      (tripMemberRepository.find as jest.Mock).mockResolvedValue([
        buildMember({ userId: 'user-1', role: TripMemberRole.OWNER }),
        buildMember(),
      ]);

      const result = await service.listMembers('trip-1', 'user-3');

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({
        userId: 'user-1',
        nickname: '지우',
        role: TripMemberRole.OWNER,
      });
    });
  });

  describe('updateMemberRole', () => {
    beforeEach(() => {
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(buildTrip());
    });

    it('owner가 아니면 TRIP_FORBIDDEN을 던진다', async () => {
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.EDITOR,
      });

      await expect(
        service.updateMemberRole('trip-1', 'user-2', 'user-3', TripMemberRole.VIEWER),
      ).rejects.toMatchObject({ code: 'TRIP_FORBIDDEN' });
    });

    it('대상 멤버가 없으면 MEMBER_NOT_FOUND를 던진다', async () => {
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.OWNER,
      });
      (tripMemberRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateMemberRole('trip-1', 'user-1', 'stranger', TripMemberRole.VIEWER),
      ).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' });
    });

    it('마지막 owner를 강등하면 LAST_OWNER_CANNOT_LEAVE를 던진다', async () => {
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.OWNER,
      });
      (tripMemberRepository.findOne as jest.Mock).mockResolvedValue(
        buildMember({ userId: 'user-1', role: TripMemberRole.OWNER }),
      );
      (tripMemberRepository.countBy as jest.Mock).mockResolvedValue(1);

      await expect(
        service.updateMemberRole('trip-1', 'user-1', 'user-1', TripMemberRole.EDITOR),
      ).rejects.toMatchObject({ code: 'LAST_OWNER_CANNOT_LEAVE' });
      expect(tripMemberRepository.save).not.toHaveBeenCalled();
    });

    it('owner가 2명 이상이면 owner 강등이 허용된다', async () => {
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue({
        role: TripMemberRole.OWNER,
      });
      (tripMemberRepository.findOne as jest.Mock).mockResolvedValue(
        buildMember({ userId: 'user-2', role: TripMemberRole.OWNER }),
      );
      (tripMemberRepository.countBy as jest.Mock).mockResolvedValue(2);

      const result = await service.updateMemberRole(
        'trip-1',
        'user-1',
        'user-2',
        TripMemberRole.EDITOR,
      );

      expect(result.role).toBe(TripMemberRole.EDITOR);
    });
  });

  describe('removeMember', () => {
    beforeEach(() => {
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(buildTrip());
    });

    it('마지막 owner를 내보내려 하면 LAST_OWNER_CANNOT_LEAVE를 던진다', async () => {
      (tripMemberRepository.findOneBy as jest.Mock)
        .mockResolvedValueOnce({ role: TripMemberRole.OWNER }) // actor assertMember
        .mockResolvedValueOnce(buildMember({ userId: 'user-1', role: TripMemberRole.OWNER }));
      (tripMemberRepository.countBy as jest.Mock).mockResolvedValue(1);

      await expect(service.removeMember('trip-1', 'user-1', 'user-1')).rejects.toMatchObject({
        code: 'LAST_OWNER_CANNOT_LEAVE',
      });
      expect(tripMemberRepository.delete).not.toHaveBeenCalled();
    });

    it('owner는 일반 멤버를 내보낼 수 있다', async () => {
      (tripMemberRepository.findOneBy as jest.Mock)
        .mockResolvedValueOnce({ role: TripMemberRole.OWNER })
        .mockResolvedValueOnce(buildMember({ id: 'member-2' }));

      await service.removeMember('trip-1', 'user-1', 'user-2');

      expect(tripMemberRepository.delete).toHaveBeenCalledWith({ id: 'member-2' });
    });
  });

  describe('leaveTrip', () => {
    beforeEach(() => {
      (tripRepository.findOneBy as jest.Mock).mockResolvedValue(buildTrip());
    });

    it('마지막 owner는 탈퇴할 수 없다', async () => {
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue(
        buildMember({ userId: 'user-1', role: TripMemberRole.OWNER }),
      );
      (tripMemberRepository.countBy as jest.Mock).mockResolvedValue(1);

      await expect(service.leaveTrip('trip-1', 'user-1')).rejects.toMatchObject({
        code: 'LAST_OWNER_CANNOT_LEAVE',
      });
      expect(tripMemberRepository.delete).not.toHaveBeenCalled();
    });

    it('editor는 자진 탈퇴할 수 있다', async () => {
      (tripMemberRepository.findOneBy as jest.Mock).mockResolvedValue(
        buildMember({ id: 'member-2' }),
      );

      await service.leaveTrip('trip-1', 'user-2');

      expect(tripMemberRepository.delete).toHaveBeenCalledWith({ id: 'member-2' });
    });
  });
});
