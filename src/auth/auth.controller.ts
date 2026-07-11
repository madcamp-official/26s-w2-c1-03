import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { BusinessException } from '../common/exceptions/business-exception';
import { CommonErrorCode } from '../common/exceptions/error-code';
import { AuthService } from './auth.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import {
  SUPPORTED_SOCIAL_PROVIDERS,
  SupportedSocialProvider,
} from './strategies/social-token-verifier';

function assertSupportedProvider(provider: string): asserts provider is SupportedSocialProvider {
  if (!(SUPPORTED_SOCIAL_PROVIDERS as readonly string[]).includes(provider)) {
    throw new BusinessException(
      CommonErrorCode.VALIDATION_ERROR,
      `지원하지 않는 provider입니다: ${provider} (현재 kakao, google만 지원)`,
    );
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post(':provider/login')
  @HttpCode(HttpStatus.OK)
  login(@Param('provider') provider: string, @Body() dto: SocialLoginDto) {
    assertSupportedProvider(provider);
    return this.authService.login(provider, dto);
  }

  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto);
  }
}
