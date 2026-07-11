import { Injectable, Logger } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business-exception';
import { AuthErrorCode } from '../exceptions/auth-error-code';
import { SocialTokenVerificationResult, SocialTokenVerifier } from './social-token-verifier';

interface KakaoUserMeResponse {
  id: number;
  kakao_account?: {
    email?: string;
    is_email_valid?: boolean;
    is_email_verified?: boolean;
  };
}

/**
 * 카카오는 앱의 REST API 키가 아니라 "사용자 본인의" 로그인 액세스 토큰을
 * Bearer로 보내 /v2/user/me를 호출하는 방식으로 검증한다(KAKAO_REST_API_KEY는
 * 여기서 쓰지 않음 — 카카오 로컬 API(장소 검색, Phase 7)에서 앱 단위 인증에 재사용).
 */
@Injectable()
export class KakaoTokenVerifier implements SocialTokenVerifier {
  private readonly logger = new Logger(KakaoTokenVerifier.name);

  async verify(accessToken: string): Promise<SocialTokenVerificationResult> {
    let response: globalThis.Response;
    try {
      response = await fetch('https://kapi.kakao.com/v2/user/me', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      this.logger.warn(`카카오 사용자 조회 네트워크 오류: ${(error as Error).message}`);
      throw new BusinessException(AuthErrorCode.NETWORK_ERROR);
    }

    if (response.status === 401) {
      throw new BusinessException(AuthErrorCode.TOKEN_INVALID);
    }
    if (!response.ok) {
      this.logger.warn(`카카오 사용자 조회 실패: status=${response.status}`);
      throw new BusinessException(AuthErrorCode.PROVIDER_ERROR);
    }

    const body = (await response.json()) as KakaoUserMeResponse;
    const account = body.kakao_account;
    const email =
      account?.is_email_valid && account?.is_email_verified ? (account.email ?? null) : null;

    return { providerUid: String(body.id), email };
  }
}
