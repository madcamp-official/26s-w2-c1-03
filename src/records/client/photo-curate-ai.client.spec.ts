import { ConfigService } from '@nestjs/config';
import { OpenAiPhotoCurateClient, PhotoCurateRequest } from './photo-curate-ai.client';

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
      if (key === 'OPENAI_PHOTOS_MODEL') return 'gpt-4o-mini';
      throw new Error(`missing env ${key}`);
    }),
  } as unknown as ConfigService;
}

function buildRequest(count = 3): PhotoCurateRequest {
  return {
    selectCount: 2,
    candidates: Array.from({ length: count }, (_, i) => ({
      photoRefId: `ref-${i}`,
      imageBuffer: Buffer.from(`fake-jpeg-${i}`),
    })),
  };
}

describe('OpenAiPhotoCurateClient', () => {
  let client: OpenAiPhotoCurateClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new OpenAiPhotoCurateClient(buildConfigService());
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('정상 JSON 응답을 candidateIndex → photoRefId로 변환한다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        mockChatResponse({ ok: true, status: 200, content: JSON.stringify({ selected: [0, 2] }) }),
      );

    const result = await client.selectBestPhotos(buildRequest());

    expect(result.selectedPhotoRefIds).toEqual(['ref-0', 'ref-2']);
  });

  it('범위를 벗어나거나 중복된 candidateIndex는 무시한다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockChatResponse({
        ok: true,
        status: 200,
        content: JSON.stringify({ selected: [1, 1, -1, 99, 'x', 0] }),
      }),
    );

    const result = await client.selectBestPhotos(buildRequest());

    expect(result.selectedPhotoRefIds).toEqual(['ref-1', 'ref-0']);
  });

  it('selected가 전부 무효하면 PHOTO_AI_REQUEST_FAILED를 던진다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        mockChatResponse({ ok: true, status: 200, content: JSON.stringify({ selected: [] }) }),
      );

    await expect(client.selectBestPhotos(buildRequest())).rejects.toMatchObject({
      code: 'PHOTO_AI_REQUEST_FAILED',
    });
  });

  it('selected 필드가 없으면 PHOTO_AI_REQUEST_FAILED를 던진다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(mockChatResponse({ ok: true, status: 200, content: JSON.stringify({}) }));

    await expect(client.selectBestPhotos(buildRequest())).rejects.toMatchObject({
      code: 'PHOTO_AI_REQUEST_FAILED',
    });
  });

  it('JSON 파싱이 안 되면 PHOTO_AI_REQUEST_FAILED를 던진다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(mockChatResponse({ ok: true, status: 200, content: 'not-json' }));

    await expect(client.selectBestPhotos(buildRequest())).rejects.toMatchObject({
      code: 'PHOTO_AI_REQUEST_FAILED',
    });
  });

  it('content가 비어 있으면 PHOTO_AI_REQUEST_FAILED를 던진다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(mockChatResponse({ ok: true, status: 200, content: undefined }));

    await expect(client.selectBestPhotos(buildRequest())).rejects.toMatchObject({
      code: 'PHOTO_AI_REQUEST_FAILED',
    });
  });

  it('응답 status가 실패면 PHOTO_AI_REQUEST_FAILED를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockChatResponse({ ok: false, status: 500 }));

    await expect(client.selectBestPhotos(buildRequest())).rejects.toMatchObject({
      code: 'PHOTO_AI_REQUEST_FAILED',
    });
  });

  it('네트워크 오류는 PHOTO_AI_REQUEST_FAILED로 변환한다', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));

    await expect(client.selectBestPhotos(buildRequest())).rejects.toMatchObject({
      code: 'PHOTO_AI_REQUEST_FAILED',
    });
  });
});
