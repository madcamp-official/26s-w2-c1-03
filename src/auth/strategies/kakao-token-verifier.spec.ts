import { KakaoTokenVerifier } from './kakao-token-verifier';

function mockFetchResponse(init: { ok: boolean; status: number; body?: unknown }) {
  return {
    ok: init.ok,
    status: init.status,
    json: async () => init.body,
  } as Response;
}

describe('KakaoTokenVerifier', () => {
  let verifier: KakaoTokenVerifier;
  const originalFetch = global.fetch;

  beforeEach(() => {
    verifier = new KakaoTokenVerifier();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('정상 응답이면 providerUid/email을 반환한다(이메일 검증 완료 시에만 email 포함)', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        ok: true,
        status: 200,
        body: {
          id: 12345,
          kakao_account: { email: 'a@test.com', is_email_valid: true, is_email_verified: true },
        },
      }),
    );

    const result = await verifier.verify('valid-access-token');

    expect(result).toEqual({ providerUid: '12345', email: 'a@test.com' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://kapi.kakao.com/v2/user/me',
      expect.objectContaining({ headers: { Authorization: 'Bearer valid-access-token' } }),
    );
  });

  it('이메일이 미검증 상태면 email을 null로 반환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        ok: true,
        status: 200,
        body: { id: 1, kakao_account: { email: 'a@test.com', is_email_verified: false } },
      }),
    );

    const result = await verifier.verify('token');
    expect(result.email).toBeNull();
  });

  it('401이면 TOKEN_INVALID를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ ok: false, status: 401 }));

    await expect(verifier.verify('expired-token')).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('카카오 서버가 5xx를 반환하면 PROVIDER_ERROR를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ ok: false, status: 502 }));

    await expect(verifier.verify('token')).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('fetch 자체가 실패하면(네트워크) NETWORK_ERROR를 던진다', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    await expect(verifier.verify('token')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
