import { ConfigService } from '@nestjs/config';
import { OpenAiScheduleClient, ScheduleAiRequest } from './open-ai-schedule.client';

function mockChatResponse(init: { ok: boolean; status: number; content?: string }) {
  return {
    ok: init.ok,
    status: init.status,
    json: async () => ({ choices: [{ message: { content: init.content } }] }),
  } as Response;
}

function buildConfigService(): ConfigService {
  return {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'OPENAI_API_KEY') return 'test-openai-key';
      if (key === 'OPENAI_BASE_URL') return 'https://api.openai.com/v1';
      if (key === 'OPENAI_SCHEDULE_MODEL') return 'gpt-4o-mini';
      throw new Error(`missing env ${key}`);
    }),
  } as unknown as ConfigService;
}

function buildRequest(): ScheduleAiRequest {
  return {
    durationDays: 2,
    places: [
      {
        id: 'p1',
        name: '장소1',
        address: '주소1',
        lat: 37.5,
        lng: 127,
        category: 'attraction',
        isRequired: true,
      },
      {
        id: 'p2',
        name: '식당2',
        address: null,
        lat: null,
        lng: null,
        category: 'restaurant',
        isRequired: false,
      },
    ],
  };
}

describe('OpenAiScheduleClient', () => {
  let client: OpenAiScheduleClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new OpenAiScheduleClient(buildConfigService());
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('정상 JSON 응답을 파싱해 days(placeId+startTime)를 반환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockChatResponse({
        ok: true,
        status: 200,
        content: JSON.stringify({
          days: [
            {
              dayNumber: 1,
              places: [
                { placeId: 'p1', startTime: '10:00' },
                { placeId: 'p2', startTime: '12:00' },
              ],
            },
          ],
        }),
      }),
    );

    const result = await client.requestSchedule(buildRequest());

    expect(result.days).toEqual([
      {
        dayNumber: 1,
        entries: [
          { placeId: 'p1', startTime: '10:00' },
          { placeId: 'p2', startTime: '12:00' },
        ],
      },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('AI가 지어낸(입력에 없는) placeId는 걸러낸다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockChatResponse({
        ok: true,
        status: 200,
        content: JSON.stringify({
          days: [
            {
              dayNumber: 1,
              places: [
                { placeId: 'p1', startTime: '10:00' },
                { placeId: 'ghost', startTime: '11:00' },
                { placeId: 'p2', startTime: '12:00' },
              ],
            },
          ],
        }),
      }),
    );

    const result = await client.requestSchedule(buildRequest());

    expect(result.days[0].entries.map((e) => e.placeId)).toEqual(['p1', 'p2']);
  });

  it('형식이 깨진 startTime은 null로 정규화한다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockChatResponse({
        ok: true,
        status: 200,
        content: JSON.stringify({
          days: [
            {
              dayNumber: 1,
              places: [
                { placeId: 'p1', startTime: '25:99' },
                { placeId: 'p2' },
              ],
            },
          ],
        }),
      }),
    );

    const result = await client.requestSchedule(buildRequest());

    expect(result.days[0].entries).toEqual([
      { placeId: 'p1', startTime: null },
      { placeId: 'p2', startTime: null },
    ]);
  });

  it('HTTP 실패는 OPENAI_REQUEST_FAILED로 변환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockChatResponse({ ok: false, status: 500 }));

    await expect(client.requestSchedule(buildRequest())).rejects.toMatchObject({
      code: 'OPENAI_REQUEST_FAILED',
    });
  });

  it('content가 비어 있으면 OPENAI_REQUEST_FAILED를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockChatResponse({ ok: true, status: 200, content: undefined }),
    );

    await expect(client.requestSchedule(buildRequest())).rejects.toMatchObject({
      code: 'OPENAI_REQUEST_FAILED',
    });
  });

  it('JSON 파싱이 안 되면 OPENAI_REQUEST_FAILED를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockChatResponse({ ok: true, status: 200, content: 'not-json' }),
    );

    await expect(client.requestSchedule(buildRequest())).rejects.toMatchObject({
      code: 'OPENAI_REQUEST_FAILED',
    });
  });

  it('네트워크 오류는 OPENAI_REQUEST_FAILED로 변환한다', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
    );

    await expect(client.requestSchedule(buildRequest())).rejects.toMatchObject({
      code: 'OPENAI_REQUEST_FAILED',
    });
  });
});
