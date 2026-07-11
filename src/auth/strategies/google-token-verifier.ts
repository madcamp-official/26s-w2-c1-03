import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { BusinessException } from '../../common/exceptions/business-exception';
import { AuthErrorCode } from '../exceptions/auth-error-code';
import { isNetworkError } from './network-error.util';
import { SocialTokenVerificationResult, SocialTokenVerifier } from './social-token-verifier';

@Injectable()
export class GoogleTokenVerifier implements SocialTokenVerifier {
  private readonly client: OAuth2Client;
  private readonly clientId: string;

  constructor(configService: ConfigService) {
    this.clientId = configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.client = new OAuth2Client(this.clientId);
  }

  async verify(idToken: string): Promise<SocialTokenVerificationResult> {
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
      const payload = ticket.getPayload();
      if (!payload?.sub) {
        throw new BusinessException(AuthErrorCode.TOKEN_INVALID);
      }
      return { providerUid: payload.sub, email: payload.email ?? null };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      if (isNetworkError(error)) throw new BusinessException(AuthErrorCode.NETWORK_ERROR);
      throw new BusinessException(
        AuthErrorCode.TOKEN_INVALID,
        error instanceof Error ? error.message : undefined,
      );
    }
  }
}
