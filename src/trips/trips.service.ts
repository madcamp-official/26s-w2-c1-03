import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { BusinessException } from '../common/exceptions/business-exception';
import { CommonErrorCode } from '../common/exceptions/error-code';
import { CreateTripDto } from './dto/create-trip.dto';
import { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripMember, TripMemberRole } from './entities/trip-member.entity';
import { Trip } from './entities/trip.entity';
import { TripsErrorCode } from './exceptions/trips-error-code';

export interface TripSummary {
  id: string;
  ownerId: string;
  title: string;
  cityName: string;
  areaCode: string | null;
  sigunguCode: string | null;
  startDate: string;
  endDate: string;
  status: Trip['status'];
  coverImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedTrips {
  items: TripSummary[];
  nextCursor: string | null;
}

interface DecodedCursor {
  createdAt: string;
  id: string;
}

const DEFAULT_LIMIT = 20;

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip) private readonly tripRepository: Repository<Trip>,
    @InjectRepository(TripMember) private readonly tripMemberRepository: Repository<TripMember>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(ownerId: string, dto: CreateTripDto): Promise<TripSummary> {
    this.assertDateRange(dto.startDate, dto.endDate);

    // Trip 생성과 owner의 trip_members 등록은 하나의 리소스 생성으로 간주해 원자적으로 처리한다
    // (§5 Phase 6 완료조건: "여행 생성 시 owner가 자동 등록").
    const trip = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(
        manager.create(Trip, {
          ownerId,
          title: dto.title,
          cityName: dto.cityName,
          areaCode: dto.areaCode ?? null,
          sigunguCode: dto.sigunguCode ?? null,
          startDate: dto.startDate,
          endDate: dto.endDate,
        }),
      );
      await manager.save(
        manager.create(TripMember, {
          tripId: created.id,
          userId: ownerId,
          role: TripMemberRole.OWNER,
        }),
      );
      return created;
    });

    return this.toSummary(trip);
  }

  async list(userId: string, query: ListTripsQueryDto): Promise<PaginatedTrips> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const cursor = this.decodeCursor(query.cursor);

    const qb = this.tripRepository
      .createQueryBuilder('trip')
      .innerJoin(TripMember, 'member', 'member.tripId = trip.id AND member.userId = :userId', {
        userId,
      })
      .where('trip.deletedAt IS NULL')
      .orderBy('trip.createdAt', 'DESC')
      .addOrderBy('trip.id', 'DESC')
      .take(limit + 1);

    if (query.status) {
      qb.andWhere('trip.status = :status', { status: query.status });
    }
    if (cursor) {
      qb.andWhere('(trip.createdAt, trip.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: page.map((trip) => this.toSummary(trip)),
      nextCursor: hasMore ? this.encodeCursor(page[page.length - 1]) : null,
    };
  }

  async getDetail(tripId: string, userId: string): Promise<TripSummary> {
    const trip = await this.findActiveTrip(tripId);
    await this.assertMember(tripId, userId);
    return this.toSummary(trip);
  }

  async update(tripId: string, userId: string, dto: UpdateTripDto): Promise<TripSummary> {
    const trip = await this.findActiveTrip(tripId);
    await this.assertMember(tripId, userId, [TripMemberRole.OWNER, TripMemberRole.EDITOR]);

    const nextStartDate = dto.startDate ?? trip.startDate;
    const nextEndDate = dto.endDate ?? trip.endDate;
    this.assertDateRange(nextStartDate, nextEndDate);

    if (dto.title !== undefined) {
      trip.title = dto.title;
    }
    trip.startDate = nextStartDate;
    trip.endDate = nextEndDate;

    const saved = await this.tripRepository.save(trip);
    return this.toSummary(saved);
  }

  async remove(tripId: string, userId: string): Promise<void> {
    await this.findActiveTrip(tripId);
    await this.assertMember(tripId, userId, [TripMemberRole.OWNER]);

    await this.tripRepository.update({ id: tripId }, { deletedAt: new Date() });
  }

  /**
   * 다른 도메인(Schedule/Places/Records 등)이 재사용할 소속·역할 검증 진입점.
   * (plan.md §3.3 데이터 흐름 예시: "TripsService.assertMember(tripId, userId) 호출
   * → trip_members 소속 검증"으로 정의된 바로 그 메서드.) allowedRoles를 생략하면
   * 소속 여부만 검증하고, 지정하면 역할까지 함께 검증한다.
   */
  async assertMember(
    tripId: string,
    userId: string,
    allowedRoles?: TripMemberRole[],
  ): Promise<TripMember> {
    const member = await this.tripMemberRepository.findOneBy({ tripId, userId });
    if (!member || (allowedRoles && !allowedRoles.includes(member.role))) {
      throw new BusinessException(TripsErrorCode.TRIP_FORBIDDEN);
    }
    return member;
  }

  private async findActiveTrip(tripId: string): Promise<Trip> {
    const trip = await this.tripRepository.findOneBy({ id: tripId, deletedAt: IsNull() });
    if (!trip) {
      throw new BusinessException(TripsErrorCode.TRIP_NOT_FOUND);
    }
    return trip;
  }

  private assertDateRange(startDate: string, endDate: string): void {
    if (startDate > endDate) {
      throw new BusinessException(
        CommonErrorCode.VALIDATION_ERROR,
        'startDate는 endDate보다 늦을 수 없습니다.',
      );
    }
  }

  private encodeCursor(trip: Trip): string {
    const payload: DecodedCursor = { createdAt: trip.createdAt.toISOString(), id: trip.id };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  private decodeCursor(cursor?: string): DecodedCursor | null {
    if (!cursor) {
      return null;
    }
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
      if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
        throw new Error('invalid cursor shape');
      }
      return parsed as DecodedCursor;
    } catch {
      throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, '유효하지 않은 cursor입니다.');
    }
  }

  private toSummary(trip: Trip): TripSummary {
    return {
      id: trip.id,
      ownerId: trip.ownerId,
      title: trip.title,
      cityName: trip.cityName,
      areaCode: trip.areaCode,
      sigunguCode: trip.sigunguCode,
      startDate: trip.startDate,
      endDate: trip.endDate,
      status: trip.status,
      coverImageUrl: trip.coverImageUrl,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
    };
  }
}
