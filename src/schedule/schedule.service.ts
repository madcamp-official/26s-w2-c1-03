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
}

const TARGET_PLACES_PER_DAY = 4;
const MAX_AI_SCHEDULE_PLACES = 16;

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
    const targetPlaceCount = this.computeTargetPlaceCount(durationDays, selectedInfos.length);
    const additionalInfos = await this.placesService.recommendAdditionalForSchedule(
      tripId,
      userId,
      selectedInfos.map((info) => info.id),
      targetPlaceCount - selectedInfos.length,
    );
    const infos = [...selectedInfos, ...additionalInfos].slice(0, targetPlaceCount);
    const requiredPlaceIds = new Set(selectedInfos.map((info) => info.id));

    const aiResult = await this.scheduleAiClient.requestSchedule({
      places: infos.map((info) => ({
        id: info.id,
        name: info.name,
        address: info.address,
        lat: info.lat,
        lng: info.lng,
        categoryCode: info.categoryCode,
        isRequired: requiredPlaceIds.has(info.id),
      })),
      durationDays,
      targetPlaceCount: infos.length,
    });

    const assignments = this.buildAssignments(aiResult, infos, durationDays, requiredPlaceIds);
    const infoById = new Map(infos.map((info) => [info.id, info]));

    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.delete(TripPlace, { tripId });
      const rows = assignments.map((assignment) =>
        manager.create(TripPlace, {
          tripId,
          placeId: assignment.placeId,
          dayNumber: assignment.dayNumber,
          orderInDay: assignment.orderInDay,
          addedBy: userId,
        }),
      );
      return manager.save(rows);
    });

    return { schedule: this.buildView(saved, infoById) };
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

  private computeTargetPlaceCount(durationDays: number, selectedCount: number): number {
    const recommended = Math.min(durationDays * TARGET_PLACES_PER_DAY, MAX_AI_SCHEDULE_PLACES);
    return Math.max(selectedCount, recommended);
  }

  /**
   * AI 결과(placeIds만)를 trip_places 배치로 변환한다. dayNumber를 [1, durationDays]로
   * 클램프하고, 중복 배치는 첫 등장만 남긴다. AI가 누락한 장소는 마지막 날에 이어 붙여
   * 선택한 장소가 모두 스케줄에 포함되도록 보정한다(§2.3: 선택 장소 전부 bulk insert).
   */
  private buildAssignments(
    aiResult: ScheduleAiResult,
    infos: ScheduledPlaceInfo[],
    durationDays: number,
    requiredPlaceIds: Set<string>,
  ): PlaceAssignment[] {
    const dayToPlaceIds = new Map<number, string[]>();
    const placed = new Set<string>();

    const sortedDays = [...aiResult.days].sort((a, b) => a.dayNumber - b.dayNumber);
    for (const day of sortedDays) {
      const dayNumber = Math.min(Math.max(Math.trunc(day.dayNumber), 1), durationDays);
      const list = dayToPlaceIds.get(dayNumber) ?? [];
      for (const placeId of day.placeIds) {
        if (placed.has(placeId)) {
          continue;
        }
        placed.add(placeId);
        list.push(placeId);
      }
      dayToPlaceIds.set(dayNumber, list);
    }

    const requiredLeftovers = infos
      .filter((info) => requiredPlaceIds.has(info.id) && !placed.has(info.id))
      .map((info) => info.id);
    const optionalFallbacks = infos
      .filter((info) => !requiredPlaceIds.has(info.id) && !placed.has(info.id))
      .map((info) => info.id)
      .slice(0, Math.max(infos.length - placed.size - requiredLeftovers.length, 0));
    const leftovers = [...requiredLeftovers, ...optionalFallbacks];
    if (leftovers.length > 0) {
      const lastDay = dayToPlaceIds.get(durationDays) ?? [];
      lastDay.push(...leftovers);
      dayToPlaceIds.set(durationDays, lastDay);
    }

    const assignments: PlaceAssignment[] = [];
    for (const dayNumber of [...dayToPlaceIds.keys()].sort((a, b) => a - b)) {
      dayToPlaceIds.get(dayNumber)!.forEach((placeId, index) => {
        assignments.push({ placeId, dayNumber, orderInDay: index + 1 });
      });
    }
    return assignments;
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
