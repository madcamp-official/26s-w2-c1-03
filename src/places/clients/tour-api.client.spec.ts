import { ConfigService } from '@nestjs/config';
import { TourApiClient } from './tour-api.client';

function mockFetchResponse(init: { ok: boolean; status: number; body?: unknown }) {
  return {
    ok: init.ok,
    status: init.status,
    json: async () => init.body,
  } as Response;
}

function buildConfigService(): ConfigService {
  return {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'TOUR_API_BASE_URL') return 'https://apis.data.go.kr/B551011/KorService2';
      if (key === 'TOUR_API_SERVICE_KEY') return 'test-service-key';
      throw new Error(`missing env ${key}`);
    }),
  } as unknown as ConfigService;
}

describe('TourApiClient', () => {
  let client: TourApiClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new TourApiClient(buildConfigService());
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('정상 응답이면 item 배열을 파싱해 반환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        ok: true,
        status: 200,
        body: {
          response: {
            header: { resultCode: '0000', resultMsg: 'OK' },
            body: {
              items: {
                item: [
                  {
                    contentid: '129156',
                    contenttypeid: '12',
                    title: '가덕도 등대',
                    addr1: '부산광역시 강서구',
                    areacode: '6',
                    sigungucode: '1',
                    mapx: '128.8295937487',
                    mapy: '35.0006471157',
                    cat1: 'A01',
                    cat2: 'A0101',
                    cat3: 'A01011600',
                  },
                ],
              },
            },
          },
        },
      }),
    );

    const result = await client.fetchAreaBasedList({ areaCode: '6' });

    expect(result).toEqual([
      {
        contentId: '129156',
        contentTypeId: '12',
        title: '가덕도 등대',
        addr1: '부산광역시 강서구',
        addr2: null,
        areaCode: '6',
        sigunguCode: '1',
        mapX: '128.8295937487',
        mapY: '35.0006471157',
        cat1: 'A01',
        cat2: 'A0101',
        cat3: 'A01011600',
        tel: null,
        firstImage: null,
      },
    ]);
  });

  it('결과가 1건이면 item이 배열이 아닌 단일 객체로 와도 배열로 정규화한다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        ok: true,
        status: 200,
        body: {
          response: {
            header: { resultCode: '0000' },
            body: { items: { item: { contentid: '1', contenttypeid: '12', title: '단일 장소' } } },
          },
        },
      }),
    );

    const result = await client.fetchAreaBasedList({ areaCode: '6' });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('단일 장소');
  });

  it('결과가 0건이면 items가 빈 문자열로 와도 빈 배열을 반환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        ok: true,
        status: 200,
        body: { response: { header: { resultCode: '0000' }, body: { items: '' } } },
      }),
    );

    const result = await client.fetchAreaBasedList({ areaCode: '6' });
    expect(result).toEqual([]);
  });

  it('resultCode가 0000이 아니면 TOUR_API_REQUEST_FAILED를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        ok: true,
        status: 200,
        body: {
          response: { header: { resultCode: '30', resultMsg: 'SERVICE KEY IS NOT REGISTERED' } },
        },
      }),
    );

    await expect(client.fetchAreaBasedList({ areaCode: '6' })).rejects.toMatchObject({
      code: 'TOUR_API_REQUEST_FAILED',
    });
  });

  it('HTTP 오류면 TOUR_API_REQUEST_FAILED를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ ok: false, status: 500 }));

    await expect(client.fetchAreaBasedList({ areaCode: '6' })).rejects.toMatchObject({
      code: 'TOUR_API_REQUEST_FAILED',
    });
  });

  it('네트워크 오류면 TOUR_API_REQUEST_FAILED를 던진다', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    await expect(client.fetchAreaBasedList({ areaCode: '6' })).rejects.toMatchObject({
      code: 'TOUR_API_REQUEST_FAILED',
    });
  });

  it('요청 URL에 areaCode/contentTypeId가 반영된다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        ok: true,
        status: 200,
        body: { response: { header: { resultCode: '0000' }, body: { items: '' } } },
      }),
    );

    await client.fetchAreaBasedList({ areaCode: '6', sigunguCode: '1', contentTypeId: '39' });

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as URL;
    expect(calledUrl.searchParams.get('areaCode')).toBe('6');
    expect(calledUrl.searchParams.get('sigunguCode')).toBe('1');
    expect(calledUrl.searchParams.get('contentTypeId')).toBe('39');
  });
});
