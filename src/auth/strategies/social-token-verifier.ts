export interface SocialTokenVerificationResult {
  providerUid: string;
  email: string | null;
}

export interface SocialTokenVerifier {
  verify(token: string): Promise<SocialTokenVerificationResult>;
}

/**
 * social_accounts.provider(provider_type enum)는 kakao/apple/google 3종이지만,
 * 애플 로그인은 이번 Phase 범위에서 뺐으므로 AuthController가 실제로 받는 provider는
 * 이 두 값으로 제한한다. DB enum 자체는 건드리지 않는다(추후 애플 추가 대비).
 */
export const SUPPORTED_SOCIAL_PROVIDERS = ['kakao', 'google'] as const;
export type SupportedSocialProvider = (typeof SUPPORTED_SOCIAL_PROVIDERS)[number];

export const SOCIAL_TOKEN_VERIFIERS = 'SOCIAL_TOKEN_VERIFIERS';
export type SocialTokenVerifierMap = Record<SupportedSocialProvider, SocialTokenVerifier>;
