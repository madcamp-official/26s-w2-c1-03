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
import { GenerateScheduleDto } from './dto/generate-schedule.dto';
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
    // getDetail이 트립 존재(TRIP_NOT_FOUND) + 멤버십을 함께 확인한다. 편집 동작이므로
    // 그 뒤에 owner/editor 역할까지 검증한다(viewer는 스케줄 생성 불가).
    const trip = await this.tripsService.getDetail(tripId, userId);
    await this.tripsService.assertMember(tripId, userId, [
      TripMemberRole.OWNER,
      TripMemberRole.EDITOR,
    ]);

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
      const dto: ScheduledTripPlaceDto = {
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
        memo: row.memo,
      };
      const list = dayMap.get(row.dayNumber) ?? [];
      list.push(dto);
      dayMap.set(row.dayNumber, list);
    }

    const days = [...dayMap.keys()]
      .sort((a, b) => a - b)
      .map((dayNumber) => ({ dayNumber, places: dayMap.get(dayNumber)! }));
    return { days };
  }
}
