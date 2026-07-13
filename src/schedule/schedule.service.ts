import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BusinessException } from '../common/exceptions/business-exception';
import { PlacesService, ScheduledPlaceInfo } from '../places/places.service';
import { TripMemberRole } from '../trips/entities/trip-member.entity';
import { TripsService } from '../trips/trips.service';
import {
  SCHEDULE_AI_CLIENT,
  ScheduleAiClient,
  ScheduleAiResult,
} from './client/open-ai-schedule.client';
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
