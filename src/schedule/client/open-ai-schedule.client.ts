import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business-exception';
import { isNetworkError } from '../../common/utils/network-error.util';
import { loadOpenAiConfig, OpenAiConfig } from '../../config/openai.config';
import { ScheduleErrorCode } from '../exceptions/schedule-error-code';

/** AI에 넘기는 장소 요약 — 좌표는 동선(거리·이동시간) 최적화, category는 식사 시간 배치에 쓰인다. */
export interface ScheduleAiPlaceInput {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  category: 'attraction' | 'restaurant' | 'cafe';
  isRequired: boolean;
}

export interface ScheduleAiRequest {
  places: ScheduleAiPlaceInput[];
  durationDays: number;
}

/** AI가 배치한 방문 항목 — startTime('HH:MM')이 형식에 안 맞으면 파싱 단계에서 null 처리. */
export interface ScheduleAiEntry {
  placeId: string;
  startTime: string | null;
}

/** AI가 돌려준 일자별 배치 결과 — 실제 trip_places 매핑은 Service가 한다. */
export interface ScheduleAiDay {
  dayNumber: number;
  entries: ScheduleAiEntry[];
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
      '당신은 국내 여행 일정을 설계하는 전문 플래너다. 입력 장소로 시간표가 있는 완성된 일자별 일정을 만든다.',
      '입력 장소는 category(attraction=관광지, restaurant=식당, cafe=카페)와 required 플래그, 좌표(lat, lng)를 가진다.',
      '',
      '하루 일정 구성 규칙:',
      '1) required=true인 장소는 반드시 전부, 정확히 한 번씩 배치한다.',
      '2) 각 날짜는 시간순으로 채운다: 오전(09:30~11:30) 관광 1~2곳 → 점심(12:00~13:00) restaurant 1곳 → 오후(13:30~17:30) 관광 1~2곳 → 동선에 여유가 있으면 오후 중간에 cafe 1곳 → 저녁(18:00~19:30) restaurant 1곳.',
      '3) 매일 점심과 저녁에 restaurant을 각각 1곳씩 반드시 배치한다. 관광 항목(attraction)은 하루 2~4곳으로 유지한다.',
      '4) 동선 최적화: 좌표가 서로 가까운 장소끼리 같은 날에 묶고, 하루 안에서는 총 이동 거리가 최소가 되는 방문 순서로 정렬한다. 좌표 기준 멀리 떨어진 장소를 하루 안에서 왔다갔다하지 않는다.',
      '5) 식당과 카페는 직전·직후에 방문하는 장소에서 가까운 곳을 고른다.',
      '6) 각 장소에 startTime("HH:MM", 24시간제)을 부여한다. 장소 간 이동시간(가까우면 10~20분, 멀면 30~60분)과 체류시간(관광지 1~2시간, 식사 1시간, 카페 40분)을 감안해 현실적인 간격을 둔다.',
      '7) 존재하지 않는 placeId를 지어내지 않고, 같은 placeId를 두 번 쓰지 않는다.',
      '',
      '반드시 아래 JSON 스키마로만 답한다. 설명 문장은 넣지 않는다.',
      '{ "days": [ { "dayNumber": <1부터 durationDays까지의 정수>, "places": [ { "placeId": "<place id>", "startTime": "HH:MM" } ] } ] }',
    ].join('\n');
  }

  private buildUserPrompt(request: ScheduleAiRequest): string {
    const placeLines = request.places
      .map(
        (place) =>
          `- id=${place.id} | category=${place.category} | required=${
            place.isRequired ? 'true' : 'false'
          } | ${place.name}` +
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
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    const result: ScheduleAiDay[] = [];
    for (const day of days) {
      const dayNumber = (day as { dayNumber?: unknown }).dayNumber;
      const placesRaw = (day as { places?: unknown }).places;
      if (typeof dayNumber !== 'number' || !Array.isArray(placesRaw)) {
        continue;
      }
      // AI가 지어낸 id는 버리고(중복 제거·누락 보정은 Service 담당), 형식이 깨진 startTime은 null 처리.
      const entries: ScheduleAiEntry[] = [];
      for (const entry of placesRaw) {
        const placeId = (entry as { placeId?: unknown }).placeId;
        if (typeof placeId !== 'string' || !validIds.has(placeId)) {
          continue;
        }
        const startTime = (entry as { startTime?: unknown }).startTime;
        entries.push({
          placeId,
          startTime: typeof startTime === 'string' && timePattern.test(startTime) ? startTime : null,
        });
      }
      result.push({ dayNumber, entries });
    }

    if (result.length === 0) {
      throw new BusinessException(ScheduleErrorCode.OPENAI_REQUEST_FAILED);
    }
    return { days: result };
  }
}
