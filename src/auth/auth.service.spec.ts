import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { SocialTokenVerifier, SocialTokenVerifierMap } from './strategies/social-token-verifier';
import { SocialAccount, SocialProvider } from '../users/entities/social-account.entity';
import { User } from '../users/entities/user.entity';

type RepoMock<T extends object> = {
  [K in keyof import('typeorm').Repository<T>]?: jest.Mock;
};

function createRepositoryMock<T extends object>(): RepoMock<T> {
  return {
    create: jest.fn((entity) => entity),
    save: jest.fn(async (entity) => entity),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    update: jest.fn(),
  };
}

describe('AuthService', () => {
  let userRepository: RepoMock<User>;
  let socialAccountRepository: RepoMock<SocialAccount>;
  let refreshTokenRepository: RepoMock<RefreshToken>;
  let kakaoVerifier: jest.Mocked<SocialTokenVerifier>;
  let googleVerifier: jest.Mocked<SocialTokenVerifier>;
  let verifiers: SocialTokenVerifierMap;
  let jwtService: { sign: jest.Mock; verify: jest.Mock; decode: jest.Mock };
  let configService: { get: jest.Mock; getOrThrow: jest.Mock };
  let service: AuthService;

  const ENV: Record<string, string> = {
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_ACCESS_EXPIRES_IN: '30m',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_REFRESH_EXPIRES_IN: '30d',
  };

  beforeEach(() => {
    userRepository = createRepositoryMock<User>();
    socialAccountRepository = createRepositoryMock<SocialAccount>();
    refreshTokenRepository = createRepositoryMock<RefreshToken>();
    kakaoVerifier = { verify: jest.fn() };
    googleVerifier = { verify: jest.fn() };
    verifiers = { kakao: kakaoVerifier, google: googleVerifier };

    jwtService = {
      sign: jest.fn((payload, options) => `signed:${JSON.stringify(payload)}:${options?.secret}`),
      verify: jest.fn(),
      decode: jest.fn(() => ({ exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 })),
    };

    configService = {
      get: jest.fn((key: string, fallback?: string) => ENV[key] ?? fallback),
      getOrThrow: jest.fn((key: string) => {
        if (!(key in ENV)) throw new Error(`missing env ${key}`);
        return ENV[key];
      }),
    };

    service = new AuthService(
      userRepository as never,
      socialAccountRepository as never,
      refreshTokenRepository as never,
      verifiers,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  describe('login', () => {
    it('idToken이 없으면 VALIDATION_ERROR로 거절한다', async () => {
      await expect(service.login('kakao', {})).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(kakaoVerifier.verify).not.toHaveBeenCalled();
    });

    it('처음 로그인하는 provider_uid면 User와 SocialAccount를 새로 만들고 isNewUser=true를 반환한다', async () => {
      kakaoVerifier.verify.mockResolvedValue({
        providerUid: 'kakao-1',
        email: 'traveler@test.com',
      });
      (socialAccountRepository.findOne as jest.Mock).mockResolvedValue(null);
      (userRepository.save as jest.Mock).mockImplementation(async (u) => ({
        id: 'user-1',
        nickname: u.nickname,
        profileImageUrl: null,
        createdAt: new Date(),
      }));

      const result = await service.login('kakao', { idToken: 'token' });

      expect(result.isNewUser).toBe(true);
      expect(result.user.id).toBe('user-1');
      expect(result.user.nickname.startsWith('traveler')).toBe(true);
      expect(socialAccountRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', provider: 'kakao', providerUid: 'kakao-1' }),
      );
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });

    it('이미 연결된 provider_uid면 기존 User를 그대로 쓰고 isNewUser=false를 반환한다', async () => {
      googleVerifier.verify.mockResolvedValue({ providerUid: 'google-1', email: null });
      const existingUser: User = {
        id: 'user-2',
        nickname: '기존유저',
        profileImageUrl: null,
        status: 'active' as User['status'],
        createdAt: new Date(),
        updatedAt: new Date(),
        withdrawnAt: null,
        socialAccounts: [],
        devices: [],
      };
      (socialAccountRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'sa-1',
        userId: 'user-2',
        provider: SocialProvider.GOOGLE,
        providerUid: 'google-1',
        email: null,
        createdAt: new Date(),
        user: existingUser,
      });

      const result = await service.login('google', { idToken: 'token' });

      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe('user-2');
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('정상 토큰이면 rotation(기존 행 revoke + 새 토큰 발급)한다', async () => {
      jwtService.verify.mockReturnValue({ userId: 'user-1' });
      const row: RefreshToken = {
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        revokedAt: null,
        createdAt: new Date(),
      } as RefreshToken;
      (refreshTokenRepository.findOneBy as jest.Mock).mockResolvedValue(row);

      const result = await service.refresh({ refreshToken: 'old-refresh-token' });

      expect(row.revokedAt).not.toBeNull();
      expect(refreshTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'rt-1' }),
      );
      expect(refreshTokenRepository.update).not.toHaveBeenCalled();
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });

    it('서명 검증 자체가 실패하면 DB 조회 없이 TOKEN_INVALID를 던진다', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(service.refresh({ refreshToken: 'garbage' })).rejects.toMatchObject({
        code: 'TOKEN_INVALID',
      });
      expect(refreshTokenRepository.findOneBy).not.toHaveBeenCalled();
    });

    it('DB에 없는 토큰이면 TOKEN_INVALID를 던진다', async () => {
      jwtService.verify.mockReturnValue({ userId: 'user-1' });
      (refreshTokenRepository.findOneBy as jest.Mock).mockResolvedValue(null);

      await expect(service.refresh({ refreshToken: 'unknown' })).rejects.toMatchObject({
        code: 'TOKEN_INVALID',
      });
    });

    it('이미 rotation으로 폐기된 토큰이 재사용되면 해당 유저의 모든 토큰을 revoke하고 TOKEN_INVALID를 던진다', async () => {
      jwtService.verify.mockReturnValue({ userId: 'user-1' });
      const alreadyRevokedRow: RefreshToken = {
        id: 'rt-old',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        revokedAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
      } as RefreshToken;
      (refreshTokenRepository.findOneBy as jest.Mock).mockResolvedValue(alreadyRevokedRow);

      await expect(service.refresh({ refreshToken: 'reused-token' })).rejects.toMatchObject({
        code: 'TOKEN_INVALID',
      });
      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('DB 기준으로 만료된 토큰이면 TOKEN_INVALID를 던진다', async () => {
      jwtService.verify.mockReturnValue({ userId: 'user-1' });
      const expiredRow: RefreshToken = {
        id: 'rt-expired',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        createdAt: new Date(),
      } as RefreshToken;
      (refreshTokenRepository.findOneBy as jest.Mock).mockResolvedValue(expiredRow);

      await expect(service.refresh({ refreshToken: 'expired-token' })).rejects.toMatchObject({
        code: 'TOKEN_INVALID',
      });
    });
  });

  describe('logout', () => {
    it('제시된 refreshToken 해시로 revokedAt을 갱신한다(존재 여부와 무관하게 항상 성공)', async () => {
      await service.logout({ refreshToken: 'some-token' });

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash: expect.any(String) }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });
  });
});
