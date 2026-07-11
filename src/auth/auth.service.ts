import { createHash, randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BusinessException } from '../common/exceptions/business-exception';
import { CommonErrorCode } from '../common/exceptions/error-code';
import { SocialAccount, SocialProvider } from '../users/entities/social-account.entity';
import { User } from '../users/entities/user.entity';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuthErrorCode } from './exceptions/auth-error-code';
import {
  SOCIAL_TOKEN_VERIFIERS,
  SocialTokenVerifierMap,
  SupportedSocialProvider,
} from './strategies/social-token-verifier';

export interface UserSummary {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
  createdAt: Date;
}

export interface SocialLoginResult {
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
  user: UserSummary;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(SocialAccount)
    private readonly socialAccountRepository: Repository<SocialAccount>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @Inject(SOCIAL_TOKEN_VERIFIERS) private readonly verifiers: SocialTokenVerifierMap,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(provider: SupportedSocialProvider, dto: SocialLoginDto): Promise<SocialLoginResult> {
    if (!dto.idToken) {
      throw new BusinessException(
        CommonErrorCode.VALIDATION_ERROR,
        'idToken이 필요합니다 (authorizationCode 플로우는 아직 지원하지 않습니다).',
      );
    }

    const { providerUid, email } = await this.verifiers[provider].verify(dto.idToken);

    let socialAccount = await this.socialAccountRepository.findOne({
      where: { provider: provider as SocialProvider, providerUid },
      relations: { user: true },
    });

    let isNewUser = false;
    let user: User;

    if (socialAccount) {
      user = socialAccount.user;
    } else {
      isNewUser = true;
      user = await this.userRepository.save(
        this.userRepository.create({ nickname: this.buildDefaultNickname(email) }),
      );
      socialAccount = await this.socialAccountRepository.save(
        this.socialAccountRepository.create({
          userId: user.id,
          provider: provider as SocialProvider,
          providerUid,
          email,
        }),
      );
    }

    const tokens = await this.issueTokenPair(user.id);
    return { ...tokens, isNewUser, user: this.toUserSummary(user) };
  }

  async refresh(dto: RefreshTokenDto): Promise<TokenPair> {
    const userId = await this.verifyAndConsumeRefreshToken(dto.refreshToken);
    return this.issueTokenPair(userId);
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    const tokenHash = this.hashToken(dto.refreshToken);
    // 존재하지 않거나 이미 폐기된 토큰이어도 조용히 0건 갱신 — 로그아웃은 항상 204.
    await this.refreshTokenRepository.update(
      { tokenHash, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /** 서명 검증 → DB 조회 → 재사용 탐지 → rotation(사용된 행 폐기) 순서로 처리하고 userId를 반환한다. */
  private async verifyAndConsumeRefreshToken(refreshToken: string): Promise<string> {
    try {
      this.jwtService.verify(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new BusinessException(AuthErrorCode.TOKEN_INVALID);
    }

    const tokenHash = this.hashToken(refreshToken);
    const row = await this.refreshTokenRepository.findOneBy({ tokenHash });
    if (!row) {
      throw new BusinessException(AuthErrorCode.TOKEN_INVALID);
    }

    if (row.revokedAt) {
      // 이미 rotation으로 폐기된 토큰이 다시 제시됨 = 재사용 탐지 → 해당 유저의 모든 세션 무효화
      await this.refreshTokenRepository.update(
        { userId: row.userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      throw new BusinessException(AuthErrorCode.TOKEN_INVALID);
    }

    if (row.expiresAt.getTime() < Date.now()) {
      throw new BusinessException(AuthErrorCode.TOKEN_INVALID);
    }

    row.revokedAt = new Date();
    await this.refreshTokenRepository.save(row);

    return row.userId;
  }

  private async issueTokenPair(userId: string): Promise<TokenPair> {
    const payload = { userId };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '30m'),
    });

    // jti: JWT의 iat는 초 단위라 payload({ userId })만으로는 같은 유저에게 같은 초 안에
    // 두 번 발급하면 문자열이 완전히 같아져 token_hash unique 제약과 충돌한다. 매 발급마다
    // 달라야 하므로 표준 클레임인 jti로 무작위성을 더한다.
    const refreshToken = this.jwtService.sign(
      { ...payload, jti: randomUUID() },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'),
      },
    );
    // exp 파싱을 직접 재구현하지 않고, 방금 서명한 토큰에서 그대로 읽어 DB 만료시각과 어긋나지 않게 한다.
    const { exp } = this.jwtService.decode(refreshToken) as { exp: number };

    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(exp * 1000),
      }),
    );

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** 실제 닉네임은 Phase 5(PATCH /users/me) 온보딩에서 사용자가 직접 설정 — 여기선 임시값만 채운다. */
  private buildDefaultNickname(email: string | null): string {
    const base = email?.split('@')[0] ?? '여행자';
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${base}${suffix}`.slice(0, 30);
  }

  private toUserSummary(user: User): UserSummary {
    return {
      id: user.id,
      nickname: user.nickname,
      profileImageUrl: user.profileImageUrl,
      createdAt: user.createdAt,
    };
  }
}
