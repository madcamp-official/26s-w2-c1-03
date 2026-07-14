import { randomBytes } from 'crypto';

/**
 * 추측 불가능한 초대 토큰 생성(API 명세서 §3.1). 32바이트 난수를 base64url로
 * 인코딩하면 43자 — trip_invite_links.token varchar(64) 제약에 들어간다.
 */
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}
