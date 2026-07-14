import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CollaborationEventBus } from '../collaboration/collaboration-event-bus';
import { buildDataSourceOptions } from '../config/database.config';
import { User } from '../users/entities/user.entity';
import { Trip, TripStatus } from './entities/trip.entity';
import { TripInviteLink } from './entities/trip-invite-link.entity';
import { TripMember } from './entities/trip-member.entity';
import { TripsService } from './trips.service';

/**
 * TripsService의 트랜잭션(생성 시 owner 자동 등록)과 cursor 기반 목록 조회(멤버십 join +
 * row-comparison 페이지네이션)는 mock repository로는 SQL 정합성을 검증할 수 없어 실제
 * Postgres로 확인한다. 실행 방법은 database/initial-schema.integration-spec.ts와 동일.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeIfDb = testDatabaseUrl ? describe : describe.skip;

describeIfDb('TripsService (Phase 6, 실DB)', () => {
  let dataSource: DataSource;
  let service: TripsService;
  let userId: string;

  beforeAll(async () => {
    dataSource = new DataSource(buildDataSourceOptions(testDatabaseUrl as string));
    await dataSource.initialize();
    await dataSource.runMigrations();

    service = new TripsService(
      dataSource.getRepository(Trip),
      dataSource.getRepository(TripMember),
      dataSource.getRepository(TripInviteLink),
      dataSource,
      new ConfigService(),
      new CollaborationEventBus(),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query(
      `TRUNCATE TABLE "trip_invite_links", "trip_members", "trips", "users" CASCADE`,
    );
    const users = dataSource.getRepository(User);
    const user = await users.save(users.create({ nickname: '지우' }));
    userId = user.id;
  });

  it('여행을 생성하면 owner가 trip_members에 자동 등록된다', async () => {
    const trip = await service.create(userId, {
      title: '오사카 여행',
      cityName: '오사카',
      startDate: '2026-07-15',
      endDate: '2026-07-19',
    });

    const members = await dataSource.getRepository(TripMember).find({ where: { tripId: trip.id } });
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId, role: 'owner' });
  });

  it('내가 속하지 않은 여행은 목록에 나오지 않는다', async () => {
    const users = dataSource.getRepository(User);
    const stranger = await users.save(users.create({ nickname: '남남' }));
    await service.create(stranger.id, {
      title: '남의 여행',
      cityName: '도쿄',
      startDate: '2026-03-01',
      endDate: '2026-03-03',
    });
    await service.create(userId, {
      title: '내 여행',
      cityName: '부산',
      startDate: '2026-04-01',
      endDate: '2026-04-03',
    });

    const result = await service.list(userId, {});
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('내 여행');
  });

  it('status 필터가 적용된다', async () => {
    const trip = await service.create(userId, {
      title: '완료된 여행',
      cityName: '교토',
      startDate: '2026-01-01',
      endDate: '2026-01-02',
    });
    await dataSource.getRepository(Trip).update({ id: trip.id }, { status: TripStatus.COMPLETED });
    await service.create(userId, {
      title: '계획중 여행',
      cityName: '나고야',
      startDate: '2026-05-01',
      endDate: '2026-05-02',
    });

    const completed = await service.list(userId, { status: TripStatus.COMPLETED });
    expect(completed.items).toHaveLength(1);
    expect(completed.items[0].title).toBe('완료된 여행');
  });

  it('삭제된 여행은 목록/상세에서 빠진다', async () => {
    const trip = await service.create(userId, {
      title: '삭제될 여행',
      cityName: '삿포로',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
    });

    await service.remove(trip.id, userId);

    const result = await service.list(userId, {});
    expect(result.items).toHaveLength(0);
    await expect(service.getDetail(trip.id, userId)).rejects.toMatchObject({
      code: 'TRIP_NOT_FOUND',
    });
  });

  it('limit보다 많으면 nextCursor가 채워지고, cursor로 다음 페이지를 이어서 가져올 수 있다', async () => {
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await service.create(userId, {
        title: `여행 ${i}`,
        cityName: '서울',
        startDate: '2026-01-01',
        endDate: '2026-01-02',
      });
    }

    const firstPage = await service.list(userId, { limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await service.list(userId, { limit: 2, cursor: firstPage.nextCursor! });
    expect(secondPage.items).toHaveLength(2);

    const firstIds = firstPage.items.map((t) => t.id);
    const secondIds = secondPage.items.map((t) => t.id);
    expect(firstIds).not.toEqual(expect.arrayContaining(secondIds));

    const thirdPage = await service.list(userId, { limit: 2, cursor: secondPage.nextCursor! });
    expect(thirdPage.items).toHaveLength(1);
    expect(thirdPage.nextCursor).toBeNull();
  });

  it('멤버가 아니면 상세 조회 시 TRIP_FORBIDDEN, editor는 수정 가능하지만 owner만 삭제 가능하다', async () => {
    const trip = await service.create(userId, {
      title: '권한 테스트',
      cityName: '제주',
      startDate: '2026-07-01',
      endDate: '2026-07-03',
    });

    const users = dataSource.getRepository(User);
    const editor = await users.save(users.create({ nickname: '에디터' }));
    await dataSource
      .getRepository(TripMember)
      .save(
        dataSource
          .getRepository(TripMember)
          .create({ tripId: trip.id, userId: editor.id, role: 'editor' as never }),
      );
    const stranger = await users.save(users.create({ nickname: '남' }));

    await expect(service.getDetail(trip.id, stranger.id)).rejects.toMatchObject({
      code: 'TRIP_FORBIDDEN',
    });

    const updated = await service.update(trip.id, editor.id, { title: '수정됨' });
    expect(updated.title).toBe('수정됨');

    await expect(service.remove(trip.id, editor.id)).rejects.toMatchObject({
      code: 'TRIP_FORBIDDEN',
    });
    await service.remove(trip.id, userId);
    await expect(service.getDetail(trip.id, userId)).rejects.toMatchObject({
      code: 'TRIP_NOT_FOUND',
    });
  });
});
