import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleTokenVerifier } from './strategies/google-token-verifier';
import { JwtStrategy } from './strategies/jwt.strategy';
import { KakaoTokenVerifier } from './strategies/kakao-token-verifier';
import { SOCIAL_TOKEN_VERIFIERS, SocialTokenVerifierMap } from './strategies/social-token-verifier';

@Module({
  imports: [
    // UsersModule이 exports: [TypeOrmModule]로 User/SocialAccount 리포지토리를 이미 노출하므로
    // 여기서 다시 forFeature로 등록하지 않고 재사용한다. refresh_tokens는 auth 소유라 여기서만 등록.
    UsersModule,
    TypeOrmModule.forFeature([RefreshToken]),
    PassportModule,
    // secret/expiresIn은 access/refresh마다 다르므로 모듈 기본값 대신 AuthService에서 호출마다 지정한다.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    KakaoTokenVerifier,
    GoogleTokenVerifier,
    {
      provide: SOCIAL_TOKEN_VERIFIERS,
      useFactory: (
        kakao: KakaoTokenVerifier,
        google: GoogleTokenVerifier,
      ): SocialTokenVerifierMap => ({
        kakao,
        google,
      }),
      inject: [KakaoTokenVerifier, GoogleTokenVerifier],
    },
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
