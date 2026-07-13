import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business-exception';
import { haversineKm } from '../../common/utils/geo.util';
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

/** 재수정(revise) 입력 — 현재 일정 항목. 커스텀 장소는 Service가 `custom:` 접두 id를 부여한다. */
export interface ScheduleAiCurrentItem extends ScheduleAiPlaceInput {
  dayNumber: number;
  startTime: string | null;
}

/** Phase 9 자연어 재수정 요청 — 현재 일정 + 추가 가능 후보 + 사용자 요청. */
export interface ScheduleReviseAiRequest {
  durationDays: number;
  userPrompt: string;
  current: ScheduleAiCurrentItem[];
  candidates: ScheduleAiPlaceInput[];
}

/**
 * 스케줄 생성 AI의 추상 인터페이스(plan.md §9.1: "인터페이스로 추상화해 이후 모델/제공자
 * 교체가 가능하도록"). Service는 이 토큰으로 주입받아 테스트에서 Mock으로 대체한다(§13).
 */
export interface ScheduleAiClient {
  requestSchedule(request: ScheduleAiRequest): Promise<ScheduleAiResult>;
  requestRevision(request: ScheduleReviseAiRequest): Promise<ScheduleAiResult>;
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
    const content = await this.callChatCompletion(
      this.buildSystemPrompt(),
      this.buildUserPrompt(request),
    );
    return this.parseResult(content, new Set(request.places.map((place) => place.id)));
  }

  async requestRevision(request: ScheduleReviseAiRequest): Promise<ScheduleAiResult> {
    const content = await this.callChatCompletion(
      this.buildReviseSystemPrompt(),
      this.buildReviseUserPrompt(request),
    );
    const validIds = new Set([
      ...request.current.map((item) => item.id),
      ...request.candidates.map((item) => item.id),
    ]);
    return this.parseResult(content, validIds);
  }

  private async callChatCompletion(systemPrompt: string, userPrompt: string): Promise<string> {
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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
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
      '입력 장소는 [필수 장소]/[관광지 후보]/[식당 후보]/[카페 후보] 섹션으로 나뉘어 있고, 각 장소에 좌표(lat, lng)와 기준점에서의 거리(km)가 표기된다.',
      '',
      '가장 중요한 원칙:',
      'A) 입력 목록의 나열 순서는 아무 의미가 없다. 입력 순서를 그대로 복사해 배치하면 안 되며, 반드시 좌표와 거리(km)를 근거로 어느 장소를 어느 날 몇 시에 방문할지 새로 설계한다.',
      'B) 같은 placeId는 전체 일정을 통틀어 최대 한 번만 사용한다. 필수 장소도 한 번만 배치하며, 여러 날에 반복해서 넣지 않는다.',
      'C) 하루는 하나의 권역이다: 서로 가까운(대략 10km 이내) 장소끼리 같은 날에 묶고, 지역이 넓으면 동쪽/서쪽처럼 권역을 날짜별로 나눈다. 멀리 떨어진 두 장소를 같은 날 왔다갔다하지 않는다.',
      '',
      '하루 일정 구성 규칙:',
      '1) [필수 장소]는 반드시 전부, 정확히 한 번씩 배치한다. 각 필수 장소가 속한 권역이 그날의 중심이 된다.',
      '2) 각 날짜는 시간순으로 채운다: 오전(09:30~11:30) 관광 1~2곳 → 점심(12:00~13:00) 식당 1곳 → 오후(13:30~17:30) 관광 1~2곳 → 동선에 여유가 있으면 오후 중간에 카페 1곳 → 저녁(18:00~19:30) 식당 1곳.',
      '3) 매일 점심과 저녁에 [식당 후보]에서 각각 1곳씩 반드시 배치한다. 관광 항목은 하루 2~4곳으로 유지한다.',
      '4) 하루 안에서는 총 이동 거리가 최소가 되는 방문 순서로 정렬한다(인접한 장소를 연달아 방문).',
      '5) 식당과 카페는 그날 동선(직전·직후 방문 장소)에서 가까운 곳을 고른다.',
      '6) 각 장소에 startTime("HH:MM", 24시간제)을 부여한다. 장소 간 이동시간(가까우면 10~20분, 멀면 30~60분)과 체류시간(관광지 1~2시간, 식사 1시간, 카페 40분)을 감안해 현실적인 간격을 둔다.',
      '7) 존재하지 않는 placeId를 지어내지 않는다.',
      '',
      '반드시 아래 JSON 스키마로만 답한다. 설명 문장은 넣지 않는다.',
      '{ "days": [ { "dayNumber": <1부터 durationDays까지의 정수>, "places": [ { "placeId": "<place id>", "startTime": "HH:MM" } ] } ] }',
    ].join('\n');
  }

  private buildUserPrompt(request: ScheduleAiRequest): string {
    // 기준점 = 필수 장소들의 중심좌표. 모델이 좌표만으로 거리를 어림하기 어려우므로
    // 기준점에서의 거리(km)를 계산해 함께 표기한다(권역 묶기·동선 판단의 근거).
    const anchorCoords = request.places.filter(
      (place) => place.isRequired && place.lat !== null && place.lng !== null,
    );
    const anchor =
      anchorCoords.length > 0
        ? {
            lat: anchorCoords.reduce((sum, p) => sum + p.lat!, 0) / anchorCoords.length,
            lng: anchorCoords.reduce((sum, p) => sum + p.lng!, 0) / anchorCoords.length,
          }
        : null;

    const toLine = (place: ScheduleAiPlaceInput): string => {
      let line = `- id=${place.id} | ${place.name}`;
      if (place.address) {
        line += ` | ${place.address}`;
      }
      if (place.lat !== null && place.lng !== null) {
        line += ` | (${place.lat}, ${place.lng})`;
        if (anchor) {
          const km = haversineKm(anchor.lat, anchor.lng, place.lat, place.lng);
          line += ` | 기준점에서 ${km.toFixed(1)}km`;
        }
      }
      return line;
    };

    const sections: Array<{ title: string; filter: (p: ScheduleAiPlaceInput) => boolean }> = [
      { title: '[필수 장소 — 반드시 모두, 각각 한 번씩 배치]', filter: (p) => p.isRequired },
      {
        title: '[관광지 후보 — 동선에 맞는 것만 선택]',
        filter: (p) => !p.isRequired && p.category === 'attraction',
      },
      {
        title: '[식당 후보 — 매일 점심·저녁 각 1곳]',
        filter: (p) => !p.isRequired && p.category === 'restaurant',
      },
      {
        title: '[카페 후보 — 동선에 여유가 있을 때만]',
        filter: (p) => !p.isRequired && p.category === 'cafe',
      },
    ];

    const lines: string[] = [
      `여행 일수: ${request.durationDays}일`,
      '기준점은 필수 장소들의 중심좌표다. 아래 목록의 나열 순서는 무작위이며 방문 순서와 무관하다.',
    ];
    for (const section of sections) {
      const members = request.places.filter(section.filter);
      if (members.length === 0) {
        continue;
      }
      lines.push('', `${section.title} (${members.length}곳)`, ...members.map(toLine));
    }
    return lines.join('\n');
  }

  private buildReviseSystemPrompt(): string {
    return [
      '당신은 국내 여행 일정을 다듬는 전문 플래너다. [현재 일정]과 [사용자 요청]이 주어지면, 요청을 반영해 전체 일정을 다시 설계한다.',
      '',
      '가장 중요한 원칙:',
      'A) 사용자 요청과 무관한 부분은 최대한 현재 일정을 유지한다(같은 날, 비슷한 시간). 요청이 닿는 부분만 바꾼다.',
      'B) 장소가 더 필요하면 [추가 가능 후보]에서만 고른다. 존재하지 않는 placeId를 지어내지 않는다.',
      'C) 같은 placeId는 전체 일정을 통틀어 최대 한 번만 사용한다.',
      'D) 하루는 하나의 권역이다: 좌표와 거리(km)를 근거로 가까운 장소끼리 같은 날에 묶고, 하루 안에서는 총 이동 거리가 최소가 되는 순서로 방문한다.',
      'E) 매일 점심(12:00~13:00)과 저녁(18:00~19:30)에 식당이 1곳씩 있도록 유지한다. 사용자가 뺀 식당은 다른 식당으로 채운다.',
      'F) 각 장소의 startTime("HH:MM")은 이동시간과 체류시간을 감안해 현실적으로 부여한다.',
      '',
      '반드시 아래 JSON 스키마로만 답한다. 설명 문장은 넣지 않는다.',
      '{ "days": [ { "dayNumber": <1부터 durationDays까지의 정수>, "places": [ { "placeId": "<place id>", "startTime": "HH:MM" } ] } ] }',
    ].join('\n');
  }

  private buildReviseUserPrompt(request: ScheduleReviseAiRequest): string {
    const currentByDay = new Map<number, ScheduleAiCurrentItem[]>();
    for (const item of request.current) {
      const list = currentByDay.get(item.dayNumber) ?? [];
      list.push(item);
      currentByDay.set(item.dayNumber, list);
    }
    const lines: string[] = [`여행 일수: ${request.durationDays}일`, '', '[현재 일정]'];
    for (const dayNumber of [...currentByDay.keys()].sort((a, b) => a - b)) {
      lines.push(`Day ${dayNumber}:`);
      for (const item of currentByDay.get(dayNumber)!) {
        lines.push(
          `- id=${item.id} | ${item.startTime ?? '시간미정'} | category=${item.category} | ${item.name}` +
            (item.lat !== null && item.lng !== null ? ` | (${item.lat}, ${item.lng})` : ''),
        );
      }
    }
    if (request.candidates.length > 0) {
      lines.push('', `[추가 가능 후보] (${request.candidates.length}곳)`);
      for (const place of request.candidates) {
        lines.push(
          `- id=${place.id} | category=${place.category} | ${place.name}` +
            (place.address ? ` | ${place.address}` : '') +
            (place.lat !== null && place.lng !== null ? ` | (${place.lat}, ${place.lng})` : ''),
        );
      }
    }
    lines.push('', '[사용자 요청]', request.userPrompt);
    return lines.join('\n');
  }

  private parseResult(content: string, validIds: Set<string>): ScheduleAiResult {
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
