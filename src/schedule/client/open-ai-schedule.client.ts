import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business-exception';
import { isNetworkError } from '../../common/utils/network-error.util';
import { loadOpenAiConfig, OpenAiConfig } from '../../config/openai.config';
import { ScheduleErrorCode } from '../exceptions/schedule-error-code';

/** AI에 넘기는 장소 요약 — 좌표/카테고리는 동선 최적화 힌트로만 쓰인다. */
export interface ScheduleAiPlaceInput {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  categoryCode: string | null;
}

export interface ScheduleAiRequest {
  places: ScheduleAiPlaceInput[];
  durationDays: number;
}

/** AI가 돌려준 일자별 배치 결과(placeIds만) — 실제 trip_places 매핑은 Service가 한다. */
export interface ScheduleAiDay {
  dayNumber: number;
  placeIds: string[];
}

export interface ScheduleAiResult {
  days: ScheduleAiDay[];
}

/**
 * 스케줄 생성 AI의 추상 인터페이스(plan.md §9.1: "인터페이스로 추상화해 이후 모델/제공자
 * 교체가 가능하도록"). Service는 이 토큰으로 주입받아 테스트에서 Mock으로 대체한다(§13).
 */
export interface ScheduleAiClient {
  requestSchedule(request: ScheduleAiRequest): Promise<ScheduleAiResult>;
}

export const SCHEDULE_AI_CLIENT = Symbol('SCHEDULE_AI_CLIENT');

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * OpenAI Chat Completions로 일자별 최적 동선을 생성한다. 기존 외부 클라이언트
 * (TourApiClient/GooglePlacesClient)와 동일하게 fetch + ConfigService 패턴을 따르며,
 * 모든 실패(네트워크/타임아웃/비정상 응답/JSON 파싱 실패)를 OPENAI_REQUEST_FAILED(502)로
 * 변환한다(plan.md §9.4).
 */
@Injectable()
export class OpenAiScheduleClient implements ScheduleAiClient {
  private readonly logger = new Logger(OpenAiScheduleClient.name);
  private readonly config: OpenAiConfig;

  constructor(configService: ConfigService) {
    this.config = loadOpenAiConfig(configService);
  }

  async requestSchedule(request: ScheduleAiRequest): Promise<ScheduleAiResult> {
    const content = await this.callChatCompletion(request);
    return this.parseResult(content, request);
  }

  private async callChatCompletion(request: ScheduleAiRequest): Promise<string> {
    let response: globalThis.Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.scheduleModel,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: this.buildSystemPrompt() },
            { role: 'user', content: this.buildUserPrompt(request) },
          ],
        }),
      });
    } catch (error) {
      // 원문 토큰/프롬프트는 로그에 남기지 않는다(plan.md §12.3). 원인 유형만 기록.
      this.logger.warn(
        `OpenAI 요청 ${isNetworkError(error) ? '네트워크 오류' : '실패'}: ${
          (error as Error).message
        }`,
      );
      throw new BusinessException(ScheduleErrorCode.OPENAI_REQUEST_FAILED);
    }

    if (!response.ok) {
      this.logger.warn(`OpenAI 요청 실패: status=${response.status}`);
      throw new BusinessException(ScheduleErrorCode.OPENAI_REQUEST_FAILED);
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      this.logger.warn('OpenAI 응답에 content가 비어 있음');
      throw new BusinessException(ScheduleErrorCode.OPENAI_REQUEST_FAILED);
    }
    return content;
  }

  private buildSystemPrompt(): string {
    return [
      '당신은 국내 여행 일정을 설계하는 전문 플래너다.',
      '사용자가 고른 장소들을 여행 일수에 맞춰 하루 단위로 나누고, 하루 안에서는 동선(위치)을 고려해 방문 순서를 정한다.',
      '반드시 아래 JSON 스키마로만 답한다. 설명 문장은 넣지 않는다.',
      '{ "days": [ { "dayNumber": <1부터 durationDays까지의 정수>, "placeIds": [<place id 문자열> ...] } ] }',
      '규칙: 입력으로 받은 모든 placeId를 정확히 한 번씩만 사용한다. 존재하지 않는 id를 지어내지 않는다. 장소 수는 각 날짜에 가급적 고르게 배분한다.',
    ].join('\n');
  }

  private buildUserPrompt(request: ScheduleAiRequest): string {
    const placeLines = request.places
      .map(
        (place) =>
          `- id=${place.id} | ${place.name}` +
          (place.address ? ` | ${place.address}` : '') +
          (place.lat !== null && place.lng !== null ? ` | (${place.lat}, ${place.lng})` : ''),
      )
      .join('\n');
    return [
      `여행 일수: ${request.durationDays}일`,
      `장소 목록(${request.places.length}곳):`,
      placeLines,
    ].join('\n');
  }

  private parseResult(content: string, request: ScheduleAiRequest): ScheduleAiResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      this.logger.warn('OpenAI 응답 JSON 파싱 실패');
      throw new BusinessException(ScheduleErrorCode.OPENAI_REQUEST_FAILED);
    }

    const days = (parsed as { days?: unknown }).days;
    if (!Array.isArray(days)) {
      this.logger.warn('OpenAI 응답에 days 배열이 없음');
      throw new BusinessException(ScheduleErrorCode.OPENAI_REQUEST_FAILED);
    }

    const validIds = new Set(request.places.map((place) => place.id));
    const result: ScheduleAiDay[] = [];
    for (const day of days) {
      const dayNumber = (day as { dayNumber?: unknown }).dayNumber;
      const placeIds = (day as { placeIds?: unknown }).placeIds;
      if (typeof dayNumber !== 'number' || !Array.isArray(placeIds)) {
        continue;
      }
      // AI가 지어낸/중복 id는 버린다 — 최종 누락 보정은 Service가 담당한다.
      const filtered = placeIds.filter(
        (id): id is string => typeof id === 'string' && validIds.has(id),
      );
      result.push({ dayNumber, placeIds: filtered });
    }

    if (result.length === 0) {
      throw new BusinessException(ScheduleErrorCode.OPENAI_REQUEST_FAILED);
    }
    return { days: result };
  }
}
