import { signPhotoPreviewToken, verifyPhotoPreviewToken } from './photo-preview-token.util';

describe('photo-preview-token', () => {
  const secret = 'test-secret-value';

  it('올바른 서명이면 만료 전에 검증을 통과한다', () => {
    const expiresAt = Date.now() + 60_000;
    const signature = signPhotoPreviewToken('ref-1', expiresAt, secret);

    expect(verifyPhotoPreviewToken('ref-1', expiresAt, signature, secret)).toBe(true);
  });

  it('만료 시각이 지나면 검증에 실패한다', () => {
    const expiresAt = Date.now() - 1;
    const signature = signPhotoPreviewToken('ref-1', expiresAt, secret);

    expect(verifyPhotoPreviewToken('ref-1', expiresAt, signature, secret)).toBe(false);
  });

  it('다른 photoRefId로 재사용하면 검증에 실패한다', () => {
    const expiresAt = Date.now() + 60_000;
    const signature = signPhotoPreviewToken('ref-1', expiresAt, secret);

    expect(verifyPhotoPreviewToken('ref-2', expiresAt, signature, secret)).toBe(false);
  });

  it('만료 시각을 변조하면 검증에 실패한다', () => {
    const expiresAt = Date.now() + 60_000;
    const signature = signPhotoPreviewToken('ref-1', expiresAt, secret);

    expect(verifyPhotoPreviewToken('ref-1', expiresAt + 1000, signature, secret)).toBe(false);
  });

  it('다른 secret으로는 검증에 실패한다', () => {
    const expiresAt = Date.now() + 60_000;
    const signature = signPhotoPreviewToken('ref-1', expiresAt, secret);

    expect(verifyPhotoPreviewToken('ref-1', expiresAt, signature, 'wrong-secret')).toBe(false);
  });

  it('서명 문자열이 조작되면 검증에 실패한다', () => {
    const expiresAt = Date.now() + 60_000;
    const signature = signPhotoPreviewToken('ref-1', expiresAt, secret);

    expect(verifyPhotoPreviewToken('ref-1', expiresAt, `${signature}0`, secret)).toBe(false);
    expect(verifyPhotoPreviewToken('ref-1', expiresAt, 'not-hex', secret)).toBe(false);
  });
});
