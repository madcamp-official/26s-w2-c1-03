import { ConfigService } from '@nestjs/config';
import { normalizePlaceName, TatsCnctrRateClient } from './tats-cnctr-rate.client';

function mockFetchResponse(init: { ok: boolean; status: number; body?: unknown }) {
  return {
    ok: init.ok,
    status: init.status,
    json: async () => init.body,
  } as Response;
}

function buildConfigService(): ConfigService {
  return {
    get: jest.fn((key: string) =>
      key === 'TOUR_API_BIGDATA_BASE_URL'
        ? 'https://apis.data.go.kr/B551011/TatsCnctrRateService'
        : undefined,
    ),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'TOUR_API_SERVICE_KEY') return 'test-service-key';
      throw new Error(`missing env ${key}`);
    }),
  } as unknown as ConfigService;
}

function okBody(items: unknown, totalCount = 1): unknown {
  return {
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: { items: { item: items }, numOfRows: 1000, pageNo: 1, totalCount },
    },
  };
}

describe('TatsCnctrRateClient', () => {
  let client: TatsCnctrRateClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new TatsCnctrRateClient(buildConfigService());
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('요청 URL에 areaCd/signguCd가 반영되고 tAtsNm은 넣지 않는다(시군구 전체 조회)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(mockFetchResponse({ ok: true, status: 200, body: okBody([], 0) }));

    await client.fetchConcentrationMap({ areaCd: '51', signguCd: '51130', baseYmd: '20260713' });

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as URL;
    expect(calledUrl.pathname).toContain('/tatsCnctrRatedList');
    expect(calledUrl.searchParams.get('areaCd')).toBe('51');
    expect(calledUrl.searchParams.get('signguCd')).toBe('51130');
    expect(calledUrl.searchParams.get('tAtsNm')).toBeNull();
  });

  it('baseYmd가 일치하는 행만 골라 정규화된 관광지명→집중률 맵으로 만든다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        ok: true,
        status: 200,
        body: okBody(
          [
            { baseYmd: '20260713', tAtsNm: '간현 관광지', cnctrRate: '64.65' },
            { baseYmd: '20260714', tAtsNm: '간현 관광지', cnctrRate: '20.1' },
            { baseYmd: '20260713', tAtsNm: '뮤지엄산', cnctrRate: '80.0' },
          ],
          3,
        ),
      }),
    );

    const map = await client.fetchConcentrationMap({
      areaCd: '51',
      signguCd: '51130',
      baseYmd: '20260713',
    });

    expect(map.get(normalizePlaceName('간현관광지'))).toBe(64.65);
    expect(map.get(normalizePlaceName('뮤지엄산'))).toBe(80.0);
    expect(map.size).toBe(2);
  });

  it('item이 단일 객체로 와도 배열로 정규화해 처리한다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        ok: true,
        status: 200,
        body: okBody({ baseYmd: '20260713', tAtsNm: '간현관광지', cnctrRate: '50' }, 1),
      }),
    );

    const map = await client.fetchConcentrationMap({
      areaCd: '51',
      signguCd: '51130',
      baseYmd: '20260713',
    });

    expect(map.get('간현관광지')).toBe(50);
  });

  it('결과 0건이면 빈 맵을 반환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        ok: true,
        status: 200,
        body: { response: { header: { resultCode: '0000' }, body: { items: '' } } },
      }),
    );

    const map = await client.fetchConcentrationMap({
      areaCd: '51',
      signguCd: '51130',
      baseYmd: '20260713',
    });

    expect(map.size).toBe(0);
  });

  it('totalCount가 페이지 크기를 넘으면 다음 페이지도 조회한다', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        mockFetchResponse({
          ok: true,
          status: 200,
          body: okBody([{ baseYmd: '20260713', tAtsNm: 'A', cnctrRate: '10' }], 1500),
        }),
      )
      .mockResolvedValueOnce(
        mockFetchResponse({
          ok: true,
          status: 200,
          body: okBody([{ baseYmd: '20260713', tAtsNm: 'B', cnctrRate: '20' }], 1500),
        }),
      );
    global.fetch = fetchMock;

    const map = await client.fetchConcentrationMap({
      areaCd: '51',
      signguCd: '51130',
      baseYmd: '20260713',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(map.get('a')).toBe(10);
    expect(map.get('b')).toBe(20);
  });

  it('resultCode가 0000이 아니면 TOUR_API_REQUEST_FAILED를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        ok: true,
        status: 200,
        body: { response: { header: { resultCode: '30', resultMsg: 'SERVICE KEY IS NOT REGISTERED' } } },
      }),
    );

    await expect(
      client.fetchConcentrationMap({ areaCd: '51', signguCd: '51130', baseYmd: '20260713' }),
    ).rejects.toMatchObject({ code: 'TOUR_API_REQUEST_FAILED' });
  });

  it('HTTP 오류면 TOUR_API_REQUEST_FAILED를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ ok: false, status: 500 }));

    await expect(
      client.fetchConcentrationMap({ areaCd: '51', signguCd: '51130', baseYmd: '20260713' }),
    ).rejects.toMatchObject({ code: 'TOUR_API_REQUEST_FAILED' });
  });
});
