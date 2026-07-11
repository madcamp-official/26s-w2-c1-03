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
});
