import { ConfigService } from '@nestjs/config';
import { GooglePlacesClient } from './google-places.client';

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
      if (key === 'GOOGLE_PLACES_API_KEY') return 'test-places-key';
      throw new Error(`missing env ${key}`);
    }),
  } as unknown as ConfigService;
}

describe('GooglePlacesClient', () => {
  let client: GooglePlacesClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new GooglePlacesClient(buildConfigService());
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('매칭되면 rating/reviewCount를 반환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        ok: true,
        status: 200,
        body: { places: [{ rating: 4.5, userRatingCount: 1234 }] },
      }),
    );

    const result = await client.matchPlace({
      name: '가덕도 등대',
      latitude: 35.0,
      longitude: 128.8,
    });

    expect(result).toEqual({ rating: 4.5, reviewCount: 1234 });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places:searchText',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Goog-Api-Key': 'test-places-key' }),
      }),
    );
  });

  it('결과가 없으면 null을 반환한다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(mockFetchResponse({ ok: true, status: 200, body: { places: [] } }));

    const result = await client.matchPlace({
      name: '존재하지 않는 장소',
      latitude: 0,
      longitude: 0,
    });
    expect(result).toBeNull();
  });

  it('rating/userRatingCount 필드가 없는 결과면 null을 반환한다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(mockFetchResponse({ ok: true, status: 200, body: { places: [{}] } }));

    const result = await client.matchPlace({ name: '리뷰 없는 장소', latitude: 0, longitude: 0 });
    expect(result).toBeNull();
  });

  it('HTTP 오류면 GOOGLE_PLACES_REQUEST_FAILED를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ ok: false, status: 403 }));

    await expect(
      client.matchPlace({ name: '장소', latitude: 0, longitude: 0 }),
    ).rejects.toMatchObject({ code: 'GOOGLE_PLACES_REQUEST_FAILED' });
  });

  it('네트워크 오류면 GOOGLE_PLACES_REQUEST_FAILED를 던진다', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    await expect(
      client.matchPlace({ name: '장소', latitude: 0, longitude: 0 }),
    ).rejects.toMatchObject({ code: 'GOOGLE_PLACES_REQUEST_FAILED' });
  });

  describe('getPlaceDetails', () => {
    it('place_id로 장소명·주소·좌표·평점을 실시간 조회한다', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        mockFetchResponse({
          ok: true,
          status: 200,
          body: {
            id: 'ChIJ123',
            displayName: { text: '스타벅스 강남점' },
            formattedAddress: '서울 강남구',
            location: { latitude: 37.5, longitude: 127.0 },
            rating: 4.3,
            userRatingCount: 500,
          },
        }),
      );

      const result = await client.getPlaceDetails('ChIJ123');

      expect(result).toEqual({
        externalId: 'ChIJ123',
        name: '스타벅스 강남점',
        address: '서울 강남구',
        latitude: 37.5,
        longitude: 127.0,
        rating: 4.3,
        reviewCount: 500,
      });
      const [calledUrl, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(calledUrl).toBe('https://places.googleapis.com/v1/places/ChIJ123');
      expect(init).toMatchObject({ method: 'GET' });
    });

    it('id나 displayName이 없으면 null을 반환한다', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(mockFetchResponse({ ok: true, status: 200, body: { id: 'ChIJ123' } }));

      expect(await client.getPlaceDetails('ChIJ123')).toBeNull();
    });

    it('HTTP 오류면 GOOGLE_PLACES_REQUEST_FAILED를 던진다', async () => {
      global.fetch = jest.fn().mockResolvedValue(mockFetchResponse({ ok: false, status: 404 }));

      await expect(client.getPlaceDetails('ChIJ123')).rejects.toMatchObject({
        code: 'GOOGLE_PLACES_REQUEST_FAILED',
      });
    });
  });
});
