import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { CollaborationEventBus } from '../collaboration/collaboration-event-bus';
import { BusinessException } from '../common/exceptions/business-exception';
import { CommonErrorCode } from '../common/exceptions/error-code';
import { CreateInviteLinkDto } from './dto/create-invite-link.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripInviteLink } from './entities/trip-invite-link.entity';
import { TripMember, TripMemberRole } from './entities/trip-member.entity';
import { Trip } from './entities/trip.entity';
import { TripsErrorCode } from './exceptions/trips-error-code';
import { generateInviteToken } from './util/invite-token';

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

/** API 명세서 §3.1 POST invite-links 응답: { token, url, expiresAt }. */
export interface InviteLinkView {
  token: string;
  url: string;
  expiresAt: string | null;
}

/** API 명세서 §3.1 GET members 응답의 member 항목. */
export interface TripMemberView {
  userId: string;
  nickname: string;
  profileImageUrl: string | null;
  role: TripMemberRole;
  joinedAt: Date;
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
    @InjectRepository(TripInviteLink)
    private readonly inviteLinkRepository: Repository<TripInviteLink>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly collaborationEventBus: CollaborationEventBus,
  ) {}

  /** 참여자 입퇴장을 WS 채널로 알린다(§3.2 member:joined / member:left). */
  private emitMemberEvent(tripId: string, event: 'member:joined' | 'member:left', member: TripMember): void {
    this.collaborationEventBus.emit({
      tripId,
      event,
      payload: { userId: member.userId, nickname: member.user?.nickname ?? '' },
    });
  }

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

  /**
   * 다른 도메인(Records — Phase 11 PATCH photos isCover, Phase 12 PUT/DELETE
   * cover)이 재사용할 대표사진 갱신 진입점(§2.6). 소속/권한 검증은 호출부 책임 —
   * 이 메서드는 값을 쓰기만 한다.
   */
  async setCoverImage(tripId: string, coverImageUrl: string | null): Promise<void> {
    await this.tripRepository.update({ id: tripId }, { coverImageUrl });
  }

  // ── Phase 10: 초대 링크 ─────────────────────────────────────────────

  /** API 명세서 §3.1: 생성 권한은 owner/editor. expiresInHours 생략 시 무기한. */
  async createInviteLink(
    tripId: string,
    userId: string,
    dto: CreateInviteLinkDto,
  ): Promise<InviteLinkView> {
    await this.findActiveTrip(tripId);
    await this.assertMember(tripId, userId, [TripMemberRole.OWNER, TripMemberRole.EDITOR]);

    const expiresAt = dto.expiresInHours
      ? new Date(Date.now() + dto.expiresInHours * 60 * 60 * 1000)
      : null;
    const link = await this.inviteLinkRepository.save(
      this.inviteLinkRepository.create({
        tripId,
        token: generateInviteToken(),
        createdBy: userId,
        expiresAt,
      }),
    );
    return this.toInviteLinkView(link);
  }

  /**
   * API 명세서 §3.1: 만료 토큰 거부, 기본 role=editor, 이미 멤버면 멱등(재-insert
   * 없이 성공 응답). 삭제된 여행의 링크는 TRIP_NOT_FOUND로 처리한다.
   */
  async joinByToken(token: string, userId: string): Promise<{ tripId: string }> {
    const link = await this.inviteLinkRepository.findOneBy({ token });
    if (!link) {
      throw new BusinessException(TripsErrorCode.INVITE_LINK_NOT_FOUND);
    }
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      throw new BusinessException(TripsErrorCode.INVITE_LINK_EXPIRED);
    }
    await this.findActiveTrip(link.tripId);

    const existing = await this.tripMemberRepository.findOneBy({ tripId: link.tripId, userId });
    if (!existing) {
      const saved = await this.tripMemberRepository.save(
        this.tripMemberRepository.create({
          tripId: link.tripId,
          userId,
          role: TripMemberRole.EDITOR,
        }),
      );
      // 닉네임을 함께 실어야 해서(§3.2 payload) user 관계를 다시 조회한다.
      const withUser = await this.tripMemberRepository.findOne({
        where: { id: saved.id },
        relations: { user: true },
      });
      this.emitMemberEvent(link.tripId, 'member:joined', withUser ?? saved);
    }
    return { tripId: link.tripId };
  }

  // ── Phase 10: 멤버 관리 ─────────────────────────────────────────────

  /** 참여자 목록 — viewer 포함 모든 멤버가 조회 가능. */
  async listMembers(tripId: string, userId: string): Promise<{ items: TripMemberView[] }> {
    await this.findActiveTrip(tripId);
    await this.assertMember(tripId, userId);

    const members = await this.tripMemberRepository.find({
      where: { tripId },
      relations: { user: true },
      order: { joinedAt: 'ASC' },
    });
    return { items: members.map((member) => this.toMemberView(member)) };
  }

  /** 역할 변경 — owner만. 마지막 owner의 강등은 LAST_OWNER_CANNOT_LEAVE로 차단. */
  async updateMemberRole(
    tripId: string,
    actorUserId: string,
    targetUserId: string,
    role: TripMemberRole,
  ): Promise<TripMemberView> {
    await this.findActiveTrip(tripId);
    await this.assertMember(tripId, actorUserId, [TripMemberRole.OWNER]);

    const target = await this.tripMemberRepository.findOne({
      where: { tripId, userId: targetUserId },
      relations: { user: true },
    });
    if (!target) {
      throw new BusinessException(TripsErrorCode.MEMBER_NOT_FOUND);
    }
    if (target.role === TripMemberRole.OWNER && role !== TripMemberRole.OWNER) {
      await this.assertNotLastOwner(tripId);
    }

    target.role = role;
    const saved = await this.tripMemberRepository.save(target);
    return this.toMemberView(saved);
  }

  /** 멤버 내보내기 — owner만. 마지막 owner(자기 자신 포함)는 내보낼 수 없다. */
  async removeMember(tripId: string, actorUserId: string, targetUserId: string): Promise<void> {
    await this.findActiveTrip(tripId);
    await this.assertMember(tripId, actorUserId, [TripMemberRole.OWNER]);

    const target = await this.tripMemberRepository.findOne({
      where: { tripId, userId: targetUserId },
      relations: { user: true },
    });
    if (!target) {
      throw new BusinessException(TripsErrorCode.MEMBER_NOT_FOUND);
    }
    if (target.role === TripMemberRole.OWNER) {
      await this.assertNotLastOwner(tripId);
    }
    await this.tripMemberRepository.delete({ id: target.id });
    this.emitMemberEvent(tripId, 'member:left', target);
  }

  /** 자진 탈퇴 — 마지막 owner는 나갈 수 없다(여행 삭제로 유도). */
  async leaveTrip(tripId: string, userId: string): Promise<void> {
    await this.findActiveTrip(tripId);
    const member = await this.assertMember(tripId, userId);

    if (member.role === TripMemberRole.OWNER) {
      await this.assertNotLastOwner(tripId);
    }
    const withUser = await this.tripMemberRepository.findOne({
      where: { id: member.id },
      relations: { user: true },
    });
    await this.tripMemberRepository.delete({ id: member.id });
    this.emitMemberEvent(tripId, 'member:left', withUser ?? member);
  }

  /** owner가 1명뿐이면 강등/추방/탈퇴를 막는다(여행이 주인 없는 상태가 되는 것 방지). */
  private async assertNotLastOwner(tripId: string): Promise<void> {
    const ownerCount = await this.tripMemberRepository.countBy({
      tripId,
      role: TripMemberRole.OWNER,
    });
    if (ownerCount <= 1) {
      throw new BusinessException(TripsErrorCode.LAST_OWNER_CANNOT_LEAVE);
    }
  }

  private toInviteLinkView(link: TripInviteLink): InviteLinkView {
    const baseUrl = this.configService.get<string>('INVITE_LINK_BASE_URL', 'tripandend://join');
    return {
      token: link.token,
      url: `${baseUrl}?token=${link.token}`,
      expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    };
  }

  private toMemberView(member: TripMember): TripMemberView {
    return {
      userId: member.userId,
      nickname: member.user?.nickname ?? '',
      profileImageUrl: member.user?.profileImageUrl ?? null,
      role: member.role,
      joinedAt: member.joinedAt,
    };
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
