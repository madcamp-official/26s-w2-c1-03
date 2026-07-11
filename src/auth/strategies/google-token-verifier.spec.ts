import { ConfigService } from '@nestjs/config';
import { GoogleTokenVerifier } from './google-token-verifier';

const verifyIdTokenMock = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: verifyIdTokenMock,
  })),
}));

describe('GoogleTokenVerifier', () => {
  let verifier: GoogleTokenVerifier;

  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('google-client-id'),
    } as unknown as ConfigService;
    verifier = new GoogleTokenVerifier(configService);
  });

  it('유효한 idToken이면 sub/email을 providerUid/email로 반환한다', async () => {
    verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({ sub: 'google-sub-1', email: 'a@test.com' }),
    });

    const result = await verifier.verify('valid-id-token');

    expect(result).toEqual({ providerUid: 'google-sub-1', email: 'a@test.com' });
    expect(verifyIdTokenMock).toHaveBeenCalledWith({
      idToken: 'valid-id-token',
      audience: 'google-client-id',
    });
  });

  it('서명 검증이 실패하면(라이브러리가 throw) TOKEN_INVALID로 변환한다', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('Wrong number of segments'));

    await expect(verifier.verify('garbage')).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('네트워크 오류(인증서 조회 실패 등)면 NETWORK_ERROR로 변환한다', async () => {
    const error = new Error('fetch failed') as Error & { cause: { code: string } };
    error.cause = { code: 'ENOTFOUND' };
    verifyIdTokenMock.mockRejectedValue(error);

    await expect(verifier.verify('token')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('payload에 sub가 없으면 TOKEN_INVALID를 던진다', async () => {
    verifyIdTokenMock.mockResolvedValue({ getPayload: () => ({ email: 'a@test.com' }) });

    await expect(verifier.verify('token')).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });
});
