import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BusinessException } from '../common/exceptions/business-exception';
import { PlaceCandidateDto, PlacesService, ScheduledPlaceInfo } from '../places/places.service';
import { TripMemberRole } from '../trips/entities/trip-member.entity';
import { TripsService } from '../trips/trips.service';
import {
  ChatMessageInput,
  ChatToolCall,
  ChatToolDefinition,
  SCHEDULE_AI_CLIENT,
  ScheduleAiClient,
  ScheduleAiResult,
} from './client/open-ai-schedule.client';
import { ChatScheduleDto } from './dto/chat-schedule.dto';
import {
  AddSchedulePlaceDto,
  ReorderScheduleDto,
  UpdateSchedulePlaceDto,
} from './dto/edit-schedule.dto';
import { GenerateScheduleDto } from './dto/generate-schedule.dto';
import { ApplyScheduleDto, ReviseScheduleDto } from './dto/revise-schedule.dto';
import { AiPlanRequest } from './entities/ai-plan-request.entity';
import { TripPlace } from './entities/trip-place.entity';
import { ScheduleErrorCode } from './exceptions/schedule-error-code';

export interface ScheduledTripPlaceDto {
  id: string;
  placeId: string | null;
  dayNumber: number;
  orderInDay: number;
  startTime: string | null;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  imageUrl: string | null;
  memo: string | null;
}

export interface ScheduleDayDto {
  dayNumber: number;
  places: ScheduledTripPlaceDto[];
}

export interface ScheduleView {
  days: ScheduleDayDto[];
}

/** revise 미리보기 항목 — 아직 저장 전이라 tripPlace id가 없다. */
export interface ScheduleProposalItemDto {
  placeId: string | null;
  customName: string | null;
  customAddress: string | null;
  dayNumber: number;
  orderInDay: number;
  startTime: string | null;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  imageUrl: string | null;
}

export interface ScheduleProposalView {
  days: Array<{ dayNumber: number; places: ScheduleProposalItemDto[] }>;
}

interface PlaceAssignment {
  placeId: string;
  dayNumber: number;
  orderInDay: number;
  startTime: string | null;
}

interface DayEntry {
  placeId: string;
  startTime: string | null;
}

/** 하루 관광 항목 목표(식사·카페 제외). AI 후보 풀 크기 산정에 쓴다. */
const ATTRACTIONS_PER_DAY = 3;
/** 관광지 보강 후보는 목표보다 약간 여유 있게 줘서 AI가 동선에 맞는 것을 고르게 한다. */
const ATTRACTION_POOL_BUFFER = 2;
const MAX_ATTRACTION_POOL = 15;
/** 점심·저녁 각 1곳 × 선택지 2배. */
const MEALS_PER_DAY = 2;
const MAX_RESTAURANT_POOL = 16;
const MAX_CAFE_POOL = 8;
/** AI가 식당 배치를 빠뜨렸을 때 보정 삽입에 쓰는 기본 식사 시각. */
const LUNCH_TIME = '12:00';
const DINNER_TIME = '18:00';
/** 이 시각 전에 배치된 식당은 점심으로 간주한다(이후면 저녁). */
const LUNCH_DINNER_BOUNDARY = '15:00';

/** 챗봇 한 요청당 최대 도구 호출 왕복 횟수(무한루프 방지). */
const MAX_CHAT_TURNS = 5;

/** 챗봇 스케줄 편집(Phase 9)이 AI에 제공하는 도구 — 실제 실행은 executeTool이 한다. */
const CHAT_TOOLS: ChatToolDefinition[] = [
  {
    name: 'search_places',
    description:
      '이름/키워드로 장소를 검색한다. 장소를 추가하기 전에는 항상 이 도구로 먼저 후보를 찾아야 한다.',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '검색할 장소 이름이나 키워드' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'add_place',
    description:
      'search_places로 찾은 장소를 특정 날짜에 추가한다. placeId를 채우면 그 검색 결과를 추가하고, ' +
      '사용자가 검색으로 찾을 수 없는 장소를 직접 말한 경우에만 placeId 없이 customName으로 추가한다.',
    parameters: {
      type: 'object',
      properties: {
        placeId: { type: 'string', description: 'search_places 결과의 id' },
        customName: { type: 'string', description: 'placeId가 없을 때만: 장소 이름 그대로' },
        dayNumber: { type: 'integer', description: '추가할 날짜(1부터 시작)' },
      },
      required: ['dayNumber'],
    },
  },
  {
    name: 'remove_place',
    description: '현재 일정에서 tripPlaceId로 지정된 장소를 제거한다.',
    parameters: {
      type: 'object',
      properties: { tripPlaceId: { type: 'string', description: '제거할 일정 항목의 id' } },
      required: ['tripPlaceId'],
    },
  },
  {
    name: 'move_place',
    description: '현재 일정에 있는 장소를 다른 날짜/순서로 옮긴다.',
    parameters: {
      type: 'object',
      properties: {
        tripPlaceId: { type: 'string', description: '옮길 일정 항목의 id' },
        dayNumber: { type: 'integer', description: '옮길 날짜(1부터 시작)' },
        orderInDay: { type: 'integer', description: '그 날짜 안에서의 순서(1부터 시작)' },
      },
      required: ['tripPlaceId', 'dayNumber', 'orderInDay'],
    },
  },
];

@Injectable()
export class ScheduleService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tripsService: TripsService,
    private readonly placesService: PlacesService,
    @Inject(SCHEDULE_AI_CLIENT) private readonly scheduleAiClient: ScheduleAiClient,
  ) {}

  /**
   * API 명세서 §2.3 POST /trips/{tripId}/schedule/generate — 선택 장소를 AI가 일자별
   * 동선으로 배치해 trip_places에 저장하고 전체 스케줄을 반환한다. 동기 처리(폴링 없음).
   *
   * 재생성 대비: 기존 trip_places를 지우고 새로 넣는다(같은 트랜잭션). "생성"은 계획의
   * 초안을 새로 만드는 동작이므로, 다시 호출하면 이전 초안을 덮어쓰는 것이 자연스럽다.
   * 수동으로 추가/편집한 항목의 보존은 Phase 9(수동 편집)에서 별도 엔드포인트로 다룬다.
   */
  async generate(
    tripId: string,
    userId: string,
    dto: GenerateScheduleDto,
  ): Promise<{ schedule: ScheduleView }> {
    const trip = await this.assertEditor(tripId, userId);

    const selectedInfos = await this.placesService.resolveForSchedule(dto.selectedPlaceIds);
    const requestedCount = new Set(dto.selectedPlaceIds).size;
    if (selectedInfos.length !== requestedCount) {
      // 존재하지 않거나 조회 실패한 place가 섞여 있으면 부분 생성하지 않고 거부한다.
      throw new BusinessException(ScheduleErrorCode.SELECTED_PLACES_INVALID);
    }

    const durationDays = this.computeDurationDays(trip.startDate, trip.endDate);

    // 선택 장소의 중심좌표에서 가까운 순으로 정렬된 카테고리별 보강 후보 풀. 관광지는
    // 하루 목표 수만큼, 식당은 매일 점심·저녁을 채울 수 있게, 카페는 하루 1곳 수준으로 준다.
    const selectedAttractionCount = selectedInfos.filter(
      (info) => info.category === 'attraction',
    ).length;
    const selectedRestaurantCount = selectedInfos.filter(
      (info) => info.category === 'restaurant',
    ).length;
    const anchors = selectedInfos
      .filter((info) => info.lat !== null && info.lng !== null)
      .map((info) => ({ lat: info.lat!, lng: info.lng! }));
    const pools = await this.placesService.getScheduleCandidatePools(
      tripId,
      userId,
      anchors,
      selectedInfos.map((info) => info.id),
      {
        attractions: Math.min(
          Math.max(
            durationDays * ATTRACTIONS_PER_DAY - selectedAttractionCount + ATTRACTION_POOL_BUFFER,
            0,
          ),
          MAX_ATTRACTION_POOL,
        ),
        restaurants: Math.min(
          Math.max(durationDays * MEALS_PER_DAY * 2 - selectedRestaurantCount, 0),
          MAX_RESTAURANT_POOL,
        ),
        cafes: Math.min(durationDays + 2, MAX_CAFE_POOL),
      },
    );

    const infos = [...selectedInfos, ...pools.attractions, ...pools.restaurants, ...pools.cafes];
    const requiredPlaceIds = new Set(selectedInfos.map((info) => info.id));

    const aiResult = await this.scheduleAiClient.requestSchedule({
      places: infos.map((info) => ({
        id: info.id,
        name: info.name,
        address: info.address,
        lat: info.lat,
        lng: info.lng,
        category: info.category,
        isRequired: requiredPlaceIds.has(info.id),
      })),
      durationDays,
    });

    const infoById = new Map(infos.map((info) => [info.id, info]));
    const assignments = this.buildAssignments(
      aiResult,
      infos,
      durationDays,
      requiredPlaceIds,
      infoById,
    );

    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.delete(TripPlace, { tripId });
      const rows = assignments.map((assignment) =>
        manager.create(TripPlace, {
          tripId,
          placeId: assignment.placeId,
          dayNumber: assignment.dayNumber,
          orderInDay: assignment.orderInDay,
          startTime: assignment.startTime,
          addedBy: userId,
        }),
      );
      return manager.save(rows);
    });

    return { schedule: this.buildView(saved, infoById) };
  }

  async getSchedule(tripId: string, userId: string): Promise<{ schedule: ScheduleView }> {
    await this.tripsService.getDetail(tripId, userId);

    const rows = await this.dataSource.getRepository(TripPlace).find({
      where: { tripId },
      order: { dayNumber: 'ASC', orderInDay: 'ASC' },
    });
    const placeIds = rows
      .map((row) => row.placeId)
      .filter((placeId): placeId is string => placeId !== null);
    const infos = await this.placesService.resolveForSchedule(placeIds);
    const infoById = new Map(infos.map((info) => [info.id, info]));

    return { schedule: this.buildView(rows, infoById) };
  }

  /**
   * API 명세서 §2.4 POST /schedule/places — placeId 참조 또는 customName 직접입력으로
   * 장소를 수동 추가한다. orderInDay를 생략하면 그날 맨 뒤, 지정하면 그 위치에 끼워
   * 넣고 이후 항목을 밀어낸다.
   */
  async addPlace(
    tripId: string,
    userId: string,
    dto: AddSchedulePlaceDto,
  ): Promise<{ tripPlace: ScheduledTripPlaceDto }> {
    const trip = await this.assertEditor(tripId, userId);
    const hasPlaceId = dto.placeId !== undefined;
    const hasCustom = Boolean(dto.customName?.trim());
    if (hasPlaceId === hasCustom) {
      // 두 경로 중 정확히 하나만 허용한다(§4.4 ERD: place_id 또는 custom_name).
      throw new BusinessException(ScheduleErrorCode.SCHEDULE_PLACE_INPUT_INVALID);
    }
    this.assertDayInRange(dto.dayNumber, trip.startDate, trip.endDate);

    let info: ScheduledPlaceInfo | undefined;
    if (hasPlaceId) {
      [info] = await this.placesService.resolveForSchedule([dto.placeId!]);
      if (!info) {
        throw new BusinessException(ScheduleErrorCode.SELECTED_PLACES_INVALID);
      }
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TripPlace);
      const rows = await repo.find({ where: { tripId } });
      const created = repo.create({
        tripId,
        placeId: dto.placeId ?? null,
        customName: hasCustom ? dto.customName!.trim() : null,
        customAddress: hasCustom ? dto.customAddress?.trim() || null : null,
        memo: dto.memo ?? null,
        dayNumber: dto.dayNumber,
        // 임시 소수 order — renumber가 이 위치 기준으로 1..n 정수를 재부여한다.
        orderInDay: (dto.orderInDay ?? Number.MAX_SAFE_INTEGER) - 0.5,
        startTime: null,
        addedBy: userId,
      });
      rows.push(created);
      await repo.save(this.renumber(rows));
      return created;
    });
    return { tripPlace: this.toPlaceDto(saved, info) };
  }

  /** API 명세서 §2.4 PATCH — 메모 수정(null이면 삭제) 및 개별 위치 이동. */
  async updatePlace(
    tripId: string,
    userId: string,
    tripPlaceId: string,
    dto: UpdateSchedulePlaceDto,
  ): Promise<{ tripPlace: ScheduledTripPlaceDto }> {
    const trip = await this.assertEditor(tripId, userId);
    if (dto.dayNumber !== undefined) {
      this.assertDayInRange(dto.dayNumber, trip.startDate, trip.endDate);
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TripPlace);
      const rows = await repo.find({ where: { tripId } });
      const target = rows.find((row) => row.id === tripPlaceId);
      if (!target) {
        throw new BusinessException(ScheduleErrorCode.TRIP_PLACE_NOT_FOUND);
      }
      const toSave = new Set<TripPlace>([target]);
      if (dto.memo !== undefined) {
        target.memo = dto.memo;
      }
      if (dto.dayNumber !== undefined || dto.orderInDay !== undefined) {
        target.dayNumber = dto.dayNumber ?? target.dayNumber;
        target.orderInDay = (dto.orderInDay ?? Number.MAX_SAFE_INTEGER) - 0.5;
        for (const row of this.renumber(rows)) {
          toSave.add(row);
        }
      }
      await repo.save([...toSave]);
      return target;
    });

    const infos = saved.placeId
      ? await this.placesService.resolveForSchedule([saved.placeId])
      : [];
    return { tripPlace: this.toPlaceDto(saved, infos[0]) };
  }

  /** API 명세서 §2.4 DELETE — 장소 제거 후 그날 orderInDay를 1..n으로 당긴다. */
  async removePlace(tripId: string, userId: string, tripPlaceId: string): Promise<void> {
    await this.assertEditor(tripId, userId);
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TripPlace);
      const rows = await repo.find({ where: { tripId } });
      const target = rows.find((row) => row.id === tripPlaceId);
      if (!target) {
        throw new BusinessException(ScheduleErrorCode.TRIP_PLACE_NOT_FOUND);
      }
      await repo.remove(target);
      const changed = this.renumber(rows.filter((row) => row !== target));
      if (changed.length > 0) {
        await repo.save(changed);
      }
    });
  }

  /**
   * API 명세서 §2.4 PATCH /schedule/reorder — 드래그앤드롭 일괄 순서 변경. operations를
   * 전부 적용한 뒤 day별로 1..n 재부여하므로, 프론트가 이동 항목만 보내도(빈 슬롯·중복
   * 순번 걱정 없이) 항상 정합한 상태가 된다. 전체를 한 트랜잭션으로 묶어 부분 실패를 막는다.
   */
  async reorder(
    tripId: string,
    userId: string,
    dto: ReorderScheduleDto,
  ): Promise<{ schedule: ScheduleView }> {
    const trip = await this.assertEditor(tripId, userId);
    for (const op of dto.operations) {
      this.assertDayInRange(op.dayNumber, trip.startDate, trip.endDate);
    }

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TripPlace);
      const rows = await repo.find({ where: { tripId } });
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const op of dto.operations) {
        const row = byId.get(op.tripPlaceId);
        if (!row) {
          throw new BusinessException(ScheduleErrorCode.TRIP_PLACE_NOT_FOUND);
        }
        row.dayNumber = op.dayNumber;
        row.orderInDay = op.orderInDay - 0.5;
      }
      const changed = this.renumber(rows);
      if (changed.length > 0) {
        await repo.save(changed);
      }
    });
    return this.getSchedule(tripId, userId);
  }

  /**
   * API 명세서 §2.5 POST /schedule/revise — 현재 일정 + 자연어 요청을 AI에 보내 수정된
   * 일정 "제안"을 만든다. **저장하지 않고** 미리보기로 반환하며, 유저가 확인 후
   * applyRevision으로 수용한다. 요청/응답 요약은 ai_plan_requests에 기록한다.
   */
  async revise(
    tripId: string,
    userId: string,
    dto: ReviseScheduleDto,
  ): Promise<{ requestId: string; proposal: ScheduleProposalView }> {
    const trip = await this.assertEditor(tripId, userId);
    const durationDays = this.computeDurationDays(trip.startDate, trip.endDate);

    const rows = await this.dataSource.getRepository(TripPlace).find({
      where: { tripId },
      order: { dayNumber: 'ASC', orderInDay: 'ASC' },
    });
    const placeIds = rows
      .map((row) => row.placeId)
      .filter((id): id is string => id !== null);
    const infos = await this.placesService.resolveForSchedule(placeIds);
    const infoById = new Map(infos.map((info) => [info.id, info]));

    // 커스텀 장소(placeId 없음)는 `custom:` 접두 id로 AI가 참조할 수 있게 한다.
    const current = rows.map((row) => {
      const info = row.placeId ? infoById.get(row.placeId) : undefined;
      return {
        id: row.placeId ?? `custom:${row.id}`,
        name: info?.name ?? row.customName ?? '',
        address: info?.address ?? row.customAddress ?? null,
        lat: info?.lat ?? null,
        lng: info?.lng ?? null,
        category: info?.category ?? ('attraction' as const),
        isRequired: false,
        dayNumber: row.dayNumber,
        startTime: row.startTime ?? null,
      };
    });

    // "카페 추가해줘" 같은 요청에 대비해 현재 일정 주변의 보강 후보도 함께 준다.
    const anchors = current
      .filter((item) => item.lat !== null && item.lng !== null)
      .map((item) => ({ lat: item.lat!, lng: item.lng! }));
    const pools = await this.placesService.getScheduleCandidatePools(
      tripId,
      userId,
      anchors,
      placeIds,
      {
        attractions: Math.min(durationDays * 2 + 2, MAX_ATTRACTION_POOL),
        restaurants: Math.min(durationDays * 2, MAX_RESTAURANT_POOL),
        cafes: Math.min(durationDays + 1, MAX_CAFE_POOL),
      },
    );
    const candidates = [...pools.attractions, ...pools.restaurants, ...pools.cafes];

    const aiResult = await this.scheduleAiClient.requestRevision({
      durationDays,
      userPrompt: dto.prompt,
      current,
      candidates: candidates.map((info) => ({
        id: info.id,
        name: info.name,
        address: info.address,
        lat: info.lat,
        lng: info.lng,
        category: info.category,
        isRequired: false,
      })),
    });

    const proposal = this.buildProposal(aiResult, durationDays, {
      infoById,
      candidateById: new Map(candidates.map((info) => [info.id, info])),
      rowById: new Map(rows.map((row) => [row.id, row])),
    });

    const requestRepo = this.dataSource.getRepository(AiPlanRequest);
    const placeCount = proposal.days.reduce((sum, day) => sum + day.places.length, 0);
    const savedRequest = await requestRepo.save(
      requestRepo.create({
        tripId,
        requestedBy: userId,
        promptText: dto.prompt,
        responseSummary: `${proposal.days.length}일 / ${placeCount}곳 수정 제안`,
      }),
    );
    return { requestId: savedRequest.id, proposal };
  }

  /**
   * POST /schedule/revise/apply — 유저가 미리보기에서 확인한(일부 항목을 뺄 수도 있는)
   * 최종 일정으로 trip_places 전체를 교체한다. 전체 교체 트랜잭션이라 부분 실패가 없다.
   */
  async applyRevision(
    tripId: string,
    userId: string,
    dto: ApplyScheduleDto,
  ): Promise<{ schedule: ScheduleView }> {
    const trip = await this.assertEditor(tripId, userId);
    for (const item of dto.items) {
      if ((item.placeId !== undefined) === Boolean(item.customName?.trim())) {
        throw new BusinessException(ScheduleErrorCode.SCHEDULE_PLACE_INPUT_INVALID);
      }
      this.assertDayInRange(item.dayNumber, trip.startDate, trip.endDate);
    }
    const placeIds = dto.items
      .map((item) => item.placeId)
      .filter((id): id is string => id !== undefined);
    const infos = await this.placesService.resolveForSchedule(placeIds);
    if (infos.length !== new Set(placeIds).size) {
      throw new BusinessException(ScheduleErrorCode.SELECTED_PLACES_INVALID);
    }
    const infoById = new Map(infos.map((info) => [info.id, info]));

    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.delete(TripPlace, { tripId });
      const sorted = [...dto.items].sort(
        (a, b) => a.dayNumber - b.dayNumber || a.orderInDay - b.orderInDay,
      );
      const counters = new Map<number, number>();
      const rows = sorted.map((item) => {
        const next = (counters.get(item.dayNumber) ?? 0) + 1;
        counters.set(item.dayNumber, next);
        return manager.create(TripPlace, {
          tripId,
          placeId: item.placeId ?? null,
          customName: item.customName?.trim() || null,
          customAddress: item.customAddress?.trim() || null,
          memo: item.memo ?? null,
          dayNumber: item.dayNumber,
          orderInDay: next,
          startTime: item.startTime ?? null,
          addedBy: userId,
        });
      });
      return manager.save(rows);
    });
    return { schedule: this.buildView(saved, infoById) };
  }

  /** AI 재수정 결과를 저장 없이 제안 뷰로 변환한다 — 클램프/중복 제거/시간순 정렬. */
  private buildProposal(
    aiResult: ScheduleAiResult,
    durationDays: number,
    lookup: {
      infoById: Map<string, ScheduledPlaceInfo>;
      candidateById: Map<string, ScheduledPlaceInfo>;
      rowById: Map<string, TripPlace>;
    },
  ): ScheduleProposalView {
    const dayToEntries = new Map<number, DayEntry[]>();
    const placed = new Set<string>();
    for (const day of [...aiResult.days].sort((a, b) => a.dayNumber - b.dayNumber)) {
      const dayNumber = Math.min(Math.max(Math.trunc(day.dayNumber), 1), durationDays);
      const list = dayToEntries.get(dayNumber) ?? [];
      for (const entry of day.entries) {
        if (placed.has(entry.placeId)) {
          continue;
        }
        placed.add(entry.placeId);
        list.push({ placeId: entry.placeId, startTime: entry.startTime });
      }
      dayToEntries.set(dayNumber, list);
    }

    const days: ScheduleProposalView['days'] = [];
    for (const dayNumber of [...dayToEntries.keys()].sort((a, b) => a - b)) {
      const entries = this.sortByStartTime(dayToEntries.get(dayNumber)!);
      const places: ScheduleProposalItemDto[] = [];
      for (const entry of entries) {
        const item = this.toProposalItem(entry, dayNumber, places.length + 1, lookup);
        if (item) {
          places.push(item);
        }
      }
      if (places.length > 0) {
        days.push({ dayNumber, places });
      }
    }
    return { days };
  }

  private toProposalItem(
    entry: DayEntry,
    dayNumber: number,
    orderInDay: number,
    lookup: {
      infoById: Map<string, ScheduledPlaceInfo>;
      candidateById: Map<string, ScheduledPlaceInfo>;
      rowById: Map<string, TripPlace>;
    },
  ): ScheduleProposalItemDto | null {
    const base = { dayNumber, orderInDay, startTime: entry.startTime };
    if (entry.placeId.startsWith('custom:')) {
      const row = lookup.rowById.get(entry.placeId.slice('custom:'.length));
      if (!row) {
        return null;
      }
      return {
        ...base,
        placeId: null,
        customName: row.customName,
        customAddress: row.customAddress,
        name: row.customName ?? '',
        address: row.customAddress,
        lat: null,
        lng: null,
        imageUrl: null,
      };
    }
    const info = lookup.infoById.get(entry.placeId) ?? lookup.candidateById.get(entry.placeId);
    if (!info) {
      return null;
    }
    return {
      ...base,
      placeId: info.id,
      customName: null,
      customAddress: null,
      name: info.name,
      address: info.address,
      lat: info.lat,
      lng: info.lng,
      imageUrl: info.imageUrl,
    };
  }

  /**
   * 챗봇 스케줄 편집(Phase 9) — 자연어 대화에서 AI가 도구(search_places/add_place/
   * remove_place/move_place)를 호출하면 그 자리에서 실제로 실행하고 답장을 만든다.
   * 대화는 세션(프론트) 한정이라 서버는 무상태이며, 매 호출마다 프론트가 전체
   * user/assistant 히스토리를 보낸다 — system/tool 메시지는 이 요청 안에서만 쓰고
   * 저장하지 않는다. 실행된 변경은 즉시 반영되며(트랜잭션은 각 도구 실행 내부에서
   * 처리), 되돌리기는 프론트가 이전 스냅샷으로 전체 교체(applyRevision)해 구현한다.
   */
  async chat(
    tripId: string,
    userId: string,
    dto: ChatScheduleDto,
  ): Promise<{ reply: string; schedule: ScheduleView; changed: boolean }> {
    const trip = await this.assertEditor(tripId, userId);
    const durationDays = this.computeDurationDays(trip.startDate, trip.endDate);

    const history: ChatMessageInput[] = [
      { role: 'system', content: await this.buildChatSystemPrompt(tripId, userId, durationDays) },
      ...dto.messages.map((m) => ({ role: m.role, content: m.content }) as ChatMessageInput),
    ];

    let changed = false;
    let finalReply: string | null = null;
    for (let turn = 0; turn < MAX_CHAT_TURNS && finalReply === null; turn++) {
      const result = await this.scheduleAiClient.requestChatTurn(history, CHAT_TOOLS);
      if (result.type === 'message') {
        finalReply = result.content;
        break;
      }
      history.push({ role: 'assistant', content: '', toolCalls: result.calls });
      for (const call of result.calls) {
        const executed = await this.executeTool(tripId, userId, call, durationDays);
        if (executed.changed) {
          changed = true;
        }
        history.push({ role: 'tool', toolCallId: call.id, content: executed.content });
      }
    }
    // 도구 호출만 반복하다 왕복 한도(MAX_CHAT_TURNS)에 닿아도 사용자에게는 답을 줘야 한다.
    finalReply ??= '요청하신 작업을 처리했어요. 최신 일정을 확인해주세요.';

    const { schedule } = await this.getSchedule(tripId, userId);

    const lastUserMessage = [...dto.messages].reverse().find((m) => m.role === 'user')?.content;
    const requestRepo = this.dataSource.getRepository(AiPlanRequest);
    await requestRepo.save(
      requestRepo.create({
        tripId,
        requestedBy: userId,
        promptText: lastUserMessage ?? '',
        responseSummary: finalReply.slice(0, 500),
      }),
    );

    return { reply: finalReply, schedule, changed };
  }

  /** AI가 tripPlaceId로 참조할 수 있도록 현재 일정을 id 포함 목록으로 시스템 프롬프트에 넣는다. */
  private async buildChatSystemPrompt(
    tripId: string,
    userId: string,
    durationDays: number,
  ): Promise<string> {
    const { schedule } = await this.getSchedule(tripId, userId);
    const lines: string[] = [];
    for (const day of [...schedule.days].sort((a, b) => a.dayNumber - b.dayNumber)) {
      lines.push(`Day ${day.dayNumber}:`);
      for (const place of [...day.places].sort((a, b) => a.orderInDay - b.orderInDay)) {
        lines.push(
          `- tripPlaceId=${place.id} | ${place.startTime ?? '시간미정'} | ${place.name}` +
            (place.address ? ` | ${place.address}` : ''),
        );
      }
    }
    if (lines.length === 0) {
      lines.push('(아직 일정에 장소가 없음)');
    }

    return [
      '당신은 여행 일정을 채팅으로 편집해주는 도우미다. 사용자의 자연어 요청을 이해해 필요한 도구를 호출해 실제로 일정을 바꾸고, 무엇을 했는지 친근한 채팅 말투로 답한다.',
      `이 여행은 총 ${durationDays}일이다. 각 날짜는 1부터 ${durationDays}까지의 dayNumber로 부른다.`,
      '',
      '현재 일정(각 항목의 tripPlaceId는 remove_place/move_place에 쓴다):',
      ...lines,
      '',
      '행동 규칙:',
      'A) 장소를 추가하기 전에는 사용자가 이미 구체적인 이름을 말했더라도 반드시 search_places로 먼저 후보를 찾는다.',
      'B) search_places 결과에 needsClarification=true가 있으면, 이름이 비슷한 후보들이 같은 지역에 여러 곳 있다는 뜻이다 — 이번 턴에는 add_place를 호출하지 말고 후보 목록을 사용자에게 보여주며 어느 곳인지 물어본다.',
      'C) needsClarification이 없으면 되묻지 말고 가장 관련성 높은 후보 하나를 스스로 골라 add_place를 바로 호출한다.',
      'D) search_places로 전혀 찾지 못했는데 사용자가 이름을 명확히 지정했다면, customName으로 직접 추가할 수 있다.',
      'E) 도구 실행 결과에 error가 있으면 원인을 사용자에게 알기 쉽게 설명하고, 필요하면 다시 시도한다.',
      'F) 한 번의 답장에서 여러 도구를 순서대로 호출해도 된다. 모든 변경이 끝나면 마지막에 무엇을 했는지 요약해 답한다.',
    ].join('\n');
  }

  /** 도구 호출 1건을 실제로 실행하고, AI에게 돌려줄 role='tool' 메시지 content(JSON)를 만든다. */
  private async executeTool(
    tripId: string,
    userId: string,
    call: ChatToolCall,
    durationDays: number,
  ): Promise<{ content: string; changed: boolean }> {
    let args: Record<string, unknown>;
    try {
      args = call.argumentsJson ? JSON.parse(call.argumentsJson) : {};
    } catch {
      return { content: JSON.stringify({ error: '요청 형식이 올바르지 않습니다.' }), changed: false };
    }

    try {
      switch (call.name) {
        case 'search_places':
          return await this.executeSearchPlaces(tripId, userId, args);
        case 'add_place':
          return await this.executeAddPlace(tripId, userId, args, durationDays);
        case 'remove_place':
          return await this.executeRemovePlace(tripId, userId, args);
        case 'move_place':
          return await this.executeMovePlace(tripId, userId, args, durationDays);
        default:
          return { content: JSON.stringify({ error: `알 수 없는 도구: ${call.name}` }), changed: false };
      }
    } catch (error) {
      const message = error instanceof BusinessException ? error.message : '처리 중 오류가 발생했습니다.';
      return { content: JSON.stringify({ error: message }), changed: false };
    }
  }

  private async executeSearchPlaces(
    tripId: string,
    userId: string,
    args: Record<string, unknown>,
  ): Promise<{ content: string; changed: boolean }> {
    const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : '';
    if (!keyword) {
      return { content: JSON.stringify({ error: 'keyword가 비어 있습니다.' }), changed: false };
    }
    const { candidates } = await this.placesService.searchCandidates(tripId, userId, keyword);
    const top = candidates.slice(0, 8);
    return {
      content: JSON.stringify({
        candidates: top.map((c) => ({ id: c.id, name: c.name, address: c.address })),
        needsClarification: this.hasAmbiguousCandidates(top),
      }),
      changed: false,
    };
  }

  private async executeAddPlace(
    tripId: string,
    userId: string,
    args: Record<string, unknown>,
    durationDays: number,
  ): Promise<{ content: string; changed: boolean }> {
    const dayNumber = Number(args.dayNumber);
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > durationDays) {
      return {
        content: JSON.stringify({ error: `dayNumber는 1~${durationDays} 사이여야 합니다.` }),
        changed: false,
      };
    }
    const placeId = typeof args.placeId === 'string' && args.placeId ? args.placeId : undefined;
    const customName =
      typeof args.customName === 'string' && args.customName ? args.customName : undefined;
    if ((placeId !== undefined) === (customName !== undefined)) {
      return {
        content: JSON.stringify({ error: 'placeId 또는 customName 중 정확히 하나가 필요합니다.' }),
        changed: false,
      };
    }

    const { tripPlace } = await this.addPlace(tripId, userId, {
      placeId,
      customName,
      dayNumber,
    } as AddSchedulePlaceDto);
    return {
      content: JSON.stringify({
        added: { tripPlaceId: tripPlace.id, name: tripPlace.name, dayNumber: tripPlace.dayNumber },
      }),
      changed: true,
    };
  }

  private async executeRemovePlace(
    tripId: string,
    userId: string,
    args: Record<string, unknown>,
  ): Promise<{ content: string; changed: boolean }> {
    const tripPlaceId = typeof args.tripPlaceId === 'string' ? args.tripPlaceId : '';
    if (!tripPlaceId) {
      return { content: JSON.stringify({ error: 'tripPlaceId가 필요합니다.' }), changed: false };
    }
    await this.removePlace(tripId, userId, tripPlaceId);
    return { content: JSON.stringify({ removed: tripPlaceId }), changed: true };
  }

  private async executeMovePlace(
    tripId: string,
    userId: string,
    args: Record<string, unknown>,
    durationDays: number,
  ): Promise<{ content: string; changed: boolean }> {
    const tripPlaceId = typeof args.tripPlaceId === 'string' ? args.tripPlaceId : '';
    const dayNumber = Number(args.dayNumber);
    const orderInDay = Number(args.orderInDay);
    if (!tripPlaceId) {
      return { content: JSON.stringify({ error: 'tripPlaceId가 필요합니다.' }), changed: false };
    }
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > durationDays) {
      return {
        content: JSON.stringify({ error: `dayNumber는 1~${durationDays} 사이여야 합니다.` }),
        changed: false,
      };
    }
    if (!Number.isInteger(orderInDay) || orderInDay < 1) {
      return { content: JSON.stringify({ error: 'orderInDay는 1 이상의 정수여야 합니다.' }), changed: false };
    }
    const { tripPlace } = await this.updatePlace(tripId, userId, tripPlaceId, {
      dayNumber,
      orderInDay,
    });
    return {
      content: JSON.stringify({
        moved: { tripPlaceId: tripPlace.id, dayNumber: tripPlace.dayNumber, orderInDay: tripPlace.orderInDay },
      }),
      changed: true,
    };
  }

  /**
   * 검색 결과 중 "같은 지역 + 비슷한 이름"이 2개 이상이면 모호하다고 본다 — 이때만
   * AI가 사용자에게 되물어야 한다(요청 A안). 그 외에는 AI가 알아서 최선의 후보를
   * 골라 바로 추가한다. PlaceCandidateDto엔 지역코드가 없어 주소 앞부분을 지역 신호로
   * 대신 쓴다(예: "제주특별자치도 제주시").
   */
  private hasAmbiguousCandidates(candidates: PlaceCandidateDto[]): boolean {
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const regionA = this.regionKeyOf(candidates[i].address);
        const regionB = this.regionKeyOf(candidates[j].address);
        if (regionA && regionA === regionB && this.areNamesSimilar(candidates[i].name, candidates[j].name)) {
          return true;
        }
      }
    }
    return false;
  }

  private regionKeyOf(address: string | null): string {
    if (!address) {
      return '';
    }
    return address.trim().split(/\s+/).slice(0, 2).join(' ');
  }

  private areNamesSimilar(a: string, b: string): boolean {
    const na = a.replace(/\s+/g, '').toLowerCase();
    const nb = b.replace(/\s+/g, '').toLowerCase();
    if (!na || !nb) {
      return false;
    }
    if (na === nb) {
      return true;
    }
    return (na.includes(nb) || nb.includes(na)) && Math.abs(na.length - nb.length) <= 3;
  }

  /** API 명세서 §2.5 GET /trips/{tripId}/ai-requests — AI 생성/수정 요청 이력(최신순). */
  async listAiRequests(
    tripId: string,
    userId: string,
  ): Promise<{
    items: Array<{
      id: string;
      promptText: string;
      responseSummary: string | null;
      requestedBy: string;
      createdAt: string;
    }>;
  }> {
    // 조회는 viewer도 가능 — 멤버십 검증만 한다(getDetail이 TRIP_NOT_FOUND/FORBIDDEN 전파).
    await this.tripsService.getDetail(tripId, userId);
    const rows = await this.dataSource.getRepository(AiPlanRequest).find({
      where: { tripId },
      order: { createdAt: 'DESC' },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        promptText: row.promptText,
        responseSummary: row.responseSummary,
        requestedBy: row.requestedBy,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** 편집 계열 공통 검증 — 트립 존재/멤버십 + owner/editor 역할(viewer는 편집 불가). */
  private async assertEditor(tripId: string, userId: string) {
    const trip = await this.tripsService.getDetail(tripId, userId);
    await this.tripsService.assertMember(tripId, userId, [
      TripMemberRole.OWNER,
      TripMemberRole.EDITOR,
    ]);
    return trip;
  }

  private assertDayInRange(dayNumber: number, startDate: string, endDate: string): void {
    if (dayNumber > this.computeDurationDays(startDate, endDate)) {
      throw new BusinessException(ScheduleErrorCode.SCHEDULE_PLACE_INPUT_INVALID);
    }
  }

  /**
   * day별로 orderInDay 순 정렬 후 1..n 정수를 재부여한다. 이동/삽입은 대상 행에 임시
   * 소수 orderInDay(목표순번−0.5)를 준 뒤 이 메서드를 부르는 방식으로 구현한다.
   * 값이 실제로 바뀐 행만 반환한다(저장 최소화).
   */
  private renumber(rows: TripPlace[]): TripPlace[] {
    const byDay = new Map<number, TripPlace[]>();
    for (const row of rows) {
      const list = byDay.get(row.dayNumber) ?? [];
      list.push(row);
      byDay.set(row.dayNumber, list);
    }
    const changed: TripPlace[] = [];
    for (const list of byDay.values()) {
      list.sort((a, b) => a.orderInDay - b.orderInDay);
      list.forEach((row, index) => {
        if (row.orderInDay !== index + 1) {
          row.orderInDay = index + 1;
          changed.push(row);
        }
      });
    }
    return changed;
  }

  /** startDate/endDate('YYYY-MM-DD')로 여행 일수를 센다(양끝 포함, 최소 1일). */
  private computeDurationDays(startDate: string, endDate: string): number {
    const toUtc = (value: string): number => {
      const [year, month, day] = value.split('-').map(Number);
      return Date.UTC(year, month - 1, day);
    };
    const diffDays = Math.round((toUtc(endDate) - toUtc(startDate)) / 86_400_000);
    return Math.max(diffDays + 1, 1);
  }

  /**
   * AI 결과를 trip_places 배치로 변환한다. dayNumber를 [1, durationDays]로 클램프하고,
   * 중복 배치는 첫 등장만 남기고, 각 날짜를 startTime 순으로 정렬한다. AI가 누락한
   * 필수 선택 장소는 마지막 날에 이어 붙이고(§2.3: 선택 장소 전부 bulk insert), AI가
   * 점심·저녁 식당을 빠뜨린 날은 후보 풀의 남는 식당으로 보정 삽입한다.
   */
  private buildAssignments(
    aiResult: ScheduleAiResult,
    infos: ScheduledPlaceInfo[],
    durationDays: number,
    requiredPlaceIds: Set<string>,
    infoById: Map<string, ScheduledPlaceInfo>,
  ): PlaceAssignment[] {
    const dayToEntries = new Map<number, DayEntry[]>();
    const placed = new Set<string>();

    const sortedDays = [...aiResult.days].sort((a, b) => a.dayNumber - b.dayNumber);
    for (const day of sortedDays) {
      const dayNumber = Math.min(Math.max(Math.trunc(day.dayNumber), 1), durationDays);
      const list = dayToEntries.get(dayNumber) ?? [];
      for (const entry of day.entries) {
        if (placed.has(entry.placeId)) {
          continue;
        }
        placed.add(entry.placeId);
        list.push({ placeId: entry.placeId, startTime: entry.startTime });
      }
      dayToEntries.set(dayNumber, list);
    }

    // 각 날짜를 시간순으로 정리한다(시간이 없는 항목은 AI가 준 순서를 유지하며 뒤로).
    for (const [dayNumber, entries] of dayToEntries) {
      dayToEntries.set(dayNumber, this.sortByStartTime(entries));
    }

    this.fillMissingMeals(dayToEntries, infos, placed, infoById);

    const requiredLeftovers = infos
      .filter((info) => requiredPlaceIds.has(info.id) && !placed.has(info.id))
      .map((info): DayEntry => ({ placeId: info.id, startTime: null }));
    if (requiredLeftovers.length > 0) {
      const lastDay = dayToEntries.get(durationDays) ?? [];
      lastDay.push(...requiredLeftovers);
      dayToEntries.set(durationDays, lastDay);
    }

    const assignments: PlaceAssignment[] = [];
    for (const dayNumber of [...dayToEntries.keys()].sort((a, b) => a - b)) {
      dayToEntries.get(dayNumber)!.forEach((entry, index) => {
        assignments.push({
          placeId: entry.placeId,
          dayNumber,
          orderInDay: index + 1,
          startTime: entry.startTime,
        });
      });
    }
    return assignments;
  }

  /** 'HH:MM' 문자열 비교 정렬 — null은 뒤로 보내되 안정 정렬로 원래 순서를 유지한다. */
  private sortByStartTime(entries: DayEntry[]): DayEntry[] {
    return [...entries].sort((a, b) => {
      if (a.startTime === null && b.startTime === null) return 0;
      if (a.startTime === null) return 1;
      if (b.startTime === null) return -1;
      return a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0;
    });
  }

  /**
   * 매일 점심·저녁 식당이 배치됐는지 검사하고, 빠진 끼니는 후보 풀에 남아 있는 식당을
   * 시간순 위치에 보정 삽입한다. 그날 이미 있는 식당은 시간(15:00 기준) 또는 순서로
   * 점심/저녁 중 어느 끼니를 채우는지 판정한다. 항목이 하나도 없는 날은 건드리지 않는다
   * (그런 날에 식사만 넣으면 오히려 이상한 하루가 된다).
   */
  private fillMissingMeals(
    dayToEntries: Map<number, DayEntry[]>,
    infos: ScheduledPlaceInfo[],
    placed: Set<string>,
    infoById: Map<string, ScheduledPlaceInfo>,
  ): void {
    // 풀 순서(선택 장소 중심에서 가까운 순)를 그대로 써서 가까운 식당부터 채운다.
    const unusedRestaurants = infos.filter(
      (info) => info.category === 'restaurant' && !placed.has(info.id),
    );

    const takeRestaurant = (): string | null => {
      const next = unusedRestaurants.shift();
      return next ? next.id : null;
    };

    for (const [dayNumber, entries] of dayToEntries) {
      if (entries.length === 0) {
        continue;
      }
      const restaurants = entries.filter(
        (entry) => infoById.get(entry.placeId)?.category === 'restaurant',
      );

      let hasLunch = false;
      let hasDinner = false;
      for (const [index, restaurant] of restaurants.entries()) {
        const coversLunch =
          restaurant.startTime !== null
            ? restaurant.startTime < LUNCH_DINNER_BOUNDARY
            : index === 0; // 시간이 없으면 첫 식당은 점심, 그 다음은 저녁으로 간주
        if (coversLunch) {
          hasLunch = true;
        } else {
          hasDinner = true;
        }
      }

      const inserts: DayEntry[] = [];
      if (!hasLunch) {
        const placeId = takeRestaurant();
        if (placeId) {
          inserts.push({ placeId, startTime: LUNCH_TIME });
        }
      }
      if (!hasDinner) {
        const placeId = takeRestaurant();
        if (placeId) {
          inserts.push({ placeId, startTime: DINNER_TIME });
        }
      }
      if (inserts.length === 0) {
        continue;
      }
      for (const insert of inserts) {
        placed.add(insert.placeId);
      }
      dayToEntries.set(dayNumber, this.sortByStartTime([...entries, ...inserts]));
    }
  }

  private buildView(
    rows: TripPlace[],
    infoById: Map<string, ScheduledPlaceInfo>,
  ): ScheduleView {
    const sorted = [...rows].sort(
      (a, b) => a.dayNumber - b.dayNumber || a.orderInDay - b.orderInDay,
    );

    const dayMap = new Map<number, ScheduledTripPlaceDto[]>();
    for (const row of sorted) {
      const info = row.placeId ? infoById.get(row.placeId) : undefined;
      const dto = this.toPlaceDto(row, info);
      const list = dayMap.get(row.dayNumber) ?? [];
      list.push(dto);
      dayMap.set(row.dayNumber, list);
    }

    const days = [...dayMap.keys()]
      .sort((a, b) => a - b)
      .map((dayNumber) => ({ dayNumber, places: dayMap.get(dayNumber)! }));
    return { days };
  }

  private toPlaceDto(row: TripPlace, info?: ScheduledPlaceInfo): ScheduledTripPlaceDto {
    return {
      id: row.id,
      placeId: row.placeId,
      dayNumber: row.dayNumber,
      orderInDay: row.orderInDay,
      startTime: row.startTime ?? null,
      name: info?.name ?? row.customName ?? '',
      address: info?.address ?? row.customAddress ?? null,
      lat: info?.lat ?? null,
      lng: info?.lng ?? null,
      imageUrl: info?.imageUrl ?? null,
      memo: row.memo ?? null,
    };
  }
}
