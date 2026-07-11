import { UserDevice } from './entities/user-device.entity';
import { User, UserStatus } from './entities/user.entity';
import { UsersService } from './users.service';

type RepoMock<T extends object> = {
  [K in keyof import('typeorm').Repository<T>]?: jest.Mock;
};

function createRepositoryMock<T extends object>(): RepoMock<T> {
  return {
    create: jest.fn((entity) => entity),
    save: jest.fn(async (entity) => entity),
    findOneBy: jest.fn(),
  };
}

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    nickname: '지우',
    profileImageUrl: null,
    status: UserStatus.ACTIVE,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    withdrawnAt: null,
    socialAccounts: [],
    devices: [],
    ...overrides,
  };
}

describe('UsersService', () => {
  let userRepository: RepoMock<User>;
  let deviceRepository: RepoMock<UserDevice>;
  let service: UsersService;

  beforeEach(() => {
    userRepository = createRepositoryMock<User>();
    deviceRepository = createRepositoryMock<UserDevice>();
    service = new UsersService(userRepository as never, deviceRepository as never);
  });

  describe('getProfile', () => {
    it('존재하는 활성 유저면 프로필을 반환한다', async () => {
      (userRepository.findOneBy as jest.Mock).mockResolvedValue(buildUser());

      const result = await service.getProfile('user-1');

      expect(result).toEqual({
        id: 'user-1',
        nickname: '지우',
        profileImageUrl: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
    });

    it('유저가 없으면 USER_NOT_FOUND를 던진다', async () => {
      (userRepository.findOneBy as jest.Mock).mockResolvedValue(null);

      await expect(service.getProfile('missing')).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
      });
    });

    it('탈퇴한 유저면 USER_NOT_FOUND를 던진다', async () => {
      (userRepository.findOneBy as jest.Mock).mockResolvedValue(
        buildUser({ status: UserStatus.WITHDRAWN }),
      );

      await expect(service.getProfile('user-1')).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
      });
    });
  });

  describe('updateProfile', () => {
    it('nickname/profileImageUrl 중 전달된 필드만 갱신한다', async () => {
      (userRepository.findOneBy as jest.Mock).mockResolvedValue(buildUser());

      const result = await service.updateProfile('user-1', { profileImageUrl: 'https://img' });

      expect(result.nickname).toBe('지우');
      expect(result.profileImageUrl).toBe('https://img');
    });
  });

  describe('withdraw', () => {
    it('status를 withdrawn으로, withdrawnAt을 현재 시각으로 갱신한다', async () => {
      const user = buildUser();
      (userRepository.findOneBy as jest.Mock).mockResolvedValue(user);

      await service.withdraw('user-1');

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: UserStatus.WITHDRAWN, withdrawnAt: expect.any(Date) }),
      );
    });
  });

  describe('registerDevice', () => {
    it('처음 보는 (userId, pushToken)이면 새 기기를 만든다', async () => {
      (deviceRepository.findOneBy as jest.Mock).mockResolvedValue(null);

      const result = await service.registerDevice('user-1', {
        pushToken: 'token-a',
        platform: 'ios',
      });

      // create()에 넘긴 객체는 service가 이후 같은 참조를 mutate하므로, 여기서는
      // create가 호출됐다는 사실과 최종 저장된 필드만 확인한다(exact equality는 mutate 이후
      // 스냅샷과 어긋나 항상 실패한다).
      expect(deviceRepository.create).toHaveBeenCalledTimes(1);
      expect(result.platform).toBe('ios');
      expect(result.isActive).toBe(true);
    });

    it('이미 등록된 (userId, pushToken)이면 기존 행을 갱신(재활성화)한다', async () => {
      const existing: UserDevice = {
        id: 'device-1',
        userId: 'user-1',
        user: undefined as never,
        pushToken: 'token-a',
        platform: 'android',
        isActive: false,
        createdAt: new Date(),
        lastActiveAt: new Date('2020-01-01T00:00:00Z'),
      };
      (deviceRepository.findOneBy as jest.Mock).mockResolvedValue(existing);

      const result = await service.registerDevice('user-1', {
        pushToken: 'token-a',
        platform: 'ios',
      });

      expect(deviceRepository.create).not.toHaveBeenCalled();
      expect(result.id).toBe('device-1');
      expect(result.platform).toBe('ios');
      expect(result.isActive).toBe(true);
    });
  });

  describe('deactivateDevice', () => {
    it('본인 소유 기기면 isActive를 false로 갱신한다', async () => {
      const device: UserDevice = {
        id: 'device-1',
        userId: 'user-1',
        user: undefined as never,
        pushToken: 'token-a',
        platform: 'ios',
        isActive: true,
        createdAt: new Date(),
        lastActiveAt: new Date(),
      };
      (deviceRepository.findOneBy as jest.Mock).mockResolvedValue(device);

      await service.deactivateDevice('user-1', 'device-1');

      expect(deviceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it('존재하지 않거나 다른 유저 소유면 DEVICE_NOT_FOUND를 던진다', async () => {
      (deviceRepository.findOneBy as jest.Mock).mockResolvedValue(null);

      await expect(service.deactivateDevice('user-1', 'device-1')).rejects.toMatchObject({
        code: 'DEVICE_NOT_FOUND',
      });
    });
  });
});
