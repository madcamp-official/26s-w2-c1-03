import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business-exception';
import { isNetworkError } from '../../common/utils/network-error.util';
import { loadOpenAiConfig, OpenAiConfig } from '../../config/openai.config';
import { RecordsErrorCode } from '../exceptions/records-error-code';

export interface PhotoCurateCandidate {
  photoRefId: string;
  /** EXIF 제거된 JPEG 바이트(§9.3 이중 스트립 — 여기 넘어오기 전에 이미 재인코딩됨). */
  imageBuffer: Buffer;
  /** 프롬프트에 촬영일시를 참고 정보로 넣는다(같은 날짜 그룹 안에서의 순서 힌트). */
  takenAt?: Date | null;
}

export interface PhotoCurateRequest {
  candidates: PhotoCurateCandidate[];
  selectCount: number;
}

export interface PhotoCurateResult {
  selectedPhotoRefIds: string[];
}

/**
 * 주어진 후보 사진 묶음 중 베스트 N장을 고르는 AI의 추상 인터페이스 —
 * ScheduleAiClient와 같은 이유로 인터페이스 분리(plan.md §9.1, 테스트에서 Mock
 * 대체 가능하게). 이 인터페이스 자체는 "무엇을 묶어 보내는지" 모른다 — 여행
 * 일수 기준 동적 배분으로 날짜별 그룹을 만들고 그룹마다 이 메서드를 호출하는
 * 책임은 호출부(RecordsService.curate)에 있다(기능명세서 §3.3).
 */
export interface PhotoCurateAiClient {
  selectBestPhotos(request: PhotoCurateRequest): Promise<PhotoCurateResult>;
}

export const PHOTO_CURATE_AI_CLIENT = Symbol('PHOTO_CURATE_AI_CLIENT');

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * OpenAI Vision으로 주어진 후보 사진 중 베스트 N장을 고른다. 호출부가 날짜별로
 * 이미 그룹핑해서 호출하므로(API 명세서 §4, 기능명세서 §3.3) 이 클라이언트는
 * 한 번의 호출 = 한 날짜 그룹으로 취급하고 그 안에서만 비교한다. 사진마다 실제
 * UUID 대신 candidateIndex(0부터 시작)로 참조하게 해 응답 파싱을 단순하고
 * 견고하게 만든다. OpenAiScheduleClient와 동일하게 fetch+ConfigService 패턴을
 * 따르며, 모든 실패를 PHOTO_AI_REQUEST_FAILED(502)로 변환한다 — 호출부
 * (RecordsService.curate)가 이 실패를 잡아 최신순 폴백으로 대체한다.
 */
@Injectable()
export class OpenAiPhotoCurateClient implements PhotoCurateAiClient {
  private readonly logger = new Logger(OpenAiPhotoCurateClient.name);
  private readonly config: OpenAiConfig;

  constructor(configService: ConfigService) {
    this.config = loadOpenAiConfig(configService);
  }

  async selectBestPhotos(request: PhotoCurateRequest): Promise<PhotoCurateResult> {
    const content = await this.callChatCompletion(request);
    return this.parseResult(content, request.candidates);
  }

  private async callChatCompletion(request: PhotoCurateRequest): Promise<string> {
    const imageContents = request.candidates.map((c) => ({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${c.imageBuffer.toString('base64')}` },
    }));

    let response: globalThis.Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.photosModel,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: this.buildSystemPrompt(request.selectCount) },
            {
              role: 'user',
              content: [
                { type: 'text', text: this.buildUserPrompt(request.candidates) },
                ...imageContents,
              ],
            },
          ],
        }),
      });
    } catch (error) {
      this.logger.warn(
        `사진 선별 OpenAI 요청 ${isNetworkError(error) ? '네트워크 오류' : '실패'}: ${
          (error as Error).message
        }`,
      );
      throw new BusinessException(RecordsErrorCode.PHOTO_AI_REQUEST_FAILED);
    }

    if (!response.ok) {
      this.logger.warn(`사진 선별 OpenAI 요청 실패: status=${response.status}`);
      throw new BusinessException(RecordsErrorCode.PHOTO_AI_REQUEST_FAILED);
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      this.logger.warn('사진 선별 OpenAI 응답에 content가 비어 있음');
      throw new BusinessException(RecordsErrorCode.PHOTO_AI_REQUEST_FAILED);
    }
    return content;
  }

  private buildSystemPrompt(selectCount: number): string {
    return [
      `당신은 여행 사진 큐레이터다. 아래 사진들은 모두 같은 날짜에 찍힌 사진이다. 이 중 기록에 남길 가치가 있는 베스트 ${selectCount}장을 고른다(사진이 그보다 적으면 있는 만큼만).`,
      '',
      '고르는 기준:',
      'A) 흔들리거나 초점이 안 맞은 사진, 노출이 심하게 과·부족한 사진은 제외한다.',
      'B) 비슷한 구도로 연속 촬영된 사진은 그중 가장 잘 나온 한 장만 남긴다.',
      'C) 스크린샷, 문서(영수증/티켓/안내판 텍스트 위주) 사진은 제외한다.',
      'D) 사람보다 풍경·장소·순간이 잘 드러나는 사진을 우선한다. 특정 인물이 화면 대부분을 차지하는 사진은 우선순위를 낮춘다(신원 식별 목적 아님, 단순 구도 판단).',
      'E) 같은 장면의 반복을 피하고, 이 날 안에서 서로 다른 순간을 대표하도록 고른다.',
      '',
      '사진마다 candidateIndex(0부터 시작하는 순번)가 이미지 순서와 대응하고, 촬영일시가 있으면 함께 표기된다.',
      '반드시 아래 JSON 스키마로만 답한다. 설명 문장은 넣지 않는다.',
      '{ "selected": [<candidateIndex 정수, ...>] }',
    ].join('\n');
  }

  private buildUserPrompt(candidates: PhotoCurateCandidate[]): string {
    const lines = candidates.map((c, i) => {
      const dateLabel = c.takenAt ? ` (${c.takenAt.toISOString().slice(0, 10)})` : '';
      return `candidateIndex=${i}${dateLabel}`;
    });
    return [
      `아래 ${candidates.length}장의 사진(이미지 순서대로 candidateIndex 대응) 중에서 골라줘.`,
      ...lines,
    ].join('\n');
  }

  private parseResult(content: string, candidates: PhotoCurateCandidate[]): PhotoCurateResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      this.logger.warn('사진 선별 OpenAI 응답 JSON 파싱 실패');
      throw new BusinessException(RecordsErrorCode.PHOTO_AI_REQUEST_FAILED);
    }

    const selected = (parsed as { selected?: unknown }).selected;
    if (!Array.isArray(selected)) {
      this.logger.warn('사진 선별 OpenAI 응답에 selected 배열이 없음');
      throw new BusinessException(RecordsErrorCode.PHOTO_AI_REQUEST_FAILED);
    }

    const selectedPhotoRefIds: string[] = [];
    const seen = new Set<number>();
    for (const raw of selected) {
      if (
        typeof raw !== 'number' ||
        !Number.isInteger(raw) ||
        raw < 0 ||
        raw >= candidates.length ||
        seen.has(raw)
      ) {
        continue;
      }
      seen.add(raw);
      selectedPhotoRefIds.push(candidates[raw].photoRefId);
    }

    if (selectedPhotoRefIds.length === 0) {
      this.logger.warn('사진 선별 OpenAI 응답에 유효한 candidateIndex가 없음');
      throw new BusinessException(RecordsErrorCode.PHOTO_AI_REQUEST_FAILED);
    }
    return { selectedPhotoRefIds };
  }
}
