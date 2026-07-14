import { createHmac, timingSafeEqual } from 'crypto';

/**
 * 추천 사진 미리보기(§4 GET .../photos/candidates "짧은 TTL 서명 URL")용 HMAC
 * 서명. 임시 버퍼 파일은 아직 인증되지 않은 요청(이미지 로더 등)이 직접 접근하므로,
 * JwtAuthGuard 대신 이 서명+만료시각으로 photoRefId 단위 접근을 제한한다.
 */
export function signPhotoPreviewToken(
  photoRefId: string,
  expiresAt: number,
  secret: string,
): string {
  return createHmac('sha256', secret).update(`${photoRefId}.${expiresAt}`).digest('hex');
}

export function verifyPhotoPreviewToken(
  photoRefId: string,
  expiresAt: number,
  signature: string,
  secret: string,
): boolean {
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return false;
  }

  const expected = Buffer.from(signPhotoPreviewToken(photoRefId, expiresAt, secret));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
