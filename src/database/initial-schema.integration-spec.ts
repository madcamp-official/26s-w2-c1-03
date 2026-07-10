import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../config/database.config';
import { User } from '../users/entities/user.entity';
import { SocialAccount, SocialProvider } from '../users/entities/social-account.entity';
import { Trip } from '../trips/entities/trip.entity';
import { TripMember, TripMemberRole } from '../trips/entities/trip-member.entity';
import { Place } from '../places/entities/place.entity';
import { TripPlace } from '../schedule/entities/trip-place.entity';
import { TravelRecord } from '../records/entities/travel-record.entity';
import { RecordPhoto } from '../records/entities/record-photo.entity';

/**
 * Phase 3 완료 조건("Repository 단위 테스트로 기본 CRUD 동작 확인")을 검증한다.
 * 실제 Supabase가 아니라 TEST_DATABASE_URL로 지정한 로컬/디스포저블 Postgres에서만 실행된다.
 *
 * 실행 방법 (로컬 Docker):
 *   docker run -d --name trip-and-end-test-db -e POSTGRES_PASSWORD=postgres \
 *     -e POSTGRES_DB=tripandend_test -p 5433:5432 postgres:16
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/tripandend_test npm run test:db
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeIfDb = testDatabaseUrl ? describe : describe.skip;

describeIfDb('초기 스키마 Repository CRUD (Phase 3)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource(buildDataSourceOptions(testDatabaseUrl as string));
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    // migrations 테이블은 남기고 도메인 테이블만 초기화해 테스트 간 격리를 보장한다.
    const tables = [
      'record_photos',
      'travel_records',
      'trip_places',
      'ai_plan_requests',
      'places',
      'trip_invite_links',
      'trip_members',
      'trips',
      'user_devices',
      'social_accounts',
      'users',
      'notification_logs',
    ];
    await dataSource.query(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} CASCADE`);
  });

  it('User를 생성하고 조회할 수 있다', async () => {
    const users = dataSource.getRepository(User);
    const saved = await users.save(users.create({ nickname: '여행자' }));

    const found = await users.findOneByOrFail({ id: saved.id });
    expect(found.nickname).toBe('여행자');
    expect(found.status).toBe('active');
  });

  it('SocialAccount는 (provider, providerUid) 조합이 유일해야 한다', async () => {
    const users = dataSource.getRepository(User);
    const socialAccounts = dataSource.getRepository(SocialAccount);
    const user = await users.save(users.create({ nickname: '카카오유저' }));

    await socialAccounts.save(
      socialAccounts.create({
        userId: user.id,
        provider: SocialProvider.KAKAO,
        providerUid: 'kakao-1',
      }),
    );

    await expect(
      socialAccounts.save(
        socialAccounts.create({
          userId: user.id,
          provider: SocialProvider.KAKAO,
          providerUid: 'kakao-1',
        }),
      ),
    ).rejects.toThrow();
  });

  it('여행 생성 시 owner를 trip_members에 등록하면 (trip, user) 유일 제약이 적용된다', async () => {
    const users = dataSource.getRepository(User);
    const trips = dataSource.getRepository(Trip);
    const members = dataSource.getRepository(TripMember);

    const owner = await users.save(users.create({ nickname: '오너' }));
    const trip = await trips.save(
      trips.create({
        ownerId: owner.id,
        title: '제주 3박4일',
        cityName: '제주',
        startDate: '2026-08-01',
        endDate: '2026-08-04',
      }),
    );
    await members.save(
      members.create({ tripId: trip.id, userId: owner.id, role: TripMemberRole.OWNER }),
    );

    await expect(
      members.save(
        members.create({ tripId: trip.id, userId: owner.id, role: TripMemberRole.EDITOR }),
      ),
    ).rejects.toThrow();
  });

  it('travel_records는 (trip, user)당 1건이며, 기록 삭제 시 record_photos가 cascade 삭제된다', async () => {
    const users = dataSource.getRepository(User);
    const trips = dataSource.getRepository(Trip);
    const records = dataSource.getRepository(TravelRecord);
    const photos = dataSource.getRepository(RecordPhoto);

    const user = await users.save(users.create({ nickname: '기록자' }));
    const trip = await trips.save(
      trips.create({
        ownerId: user.id,
        title: '부산 여행',
        cityName: '부산',
        startDate: '2026-09-01',
        endDate: '2026-09-03',
      }),
    );
    const record = await records.save(records.create({ tripId: trip.id, userId: user.id }));

    await expect(
      records.save(records.create({ tripId: trip.id, userId: user.id })),
    ).rejects.toThrow();

    const photo = await photos.save(
      photos.create({ recordId: record.id, storageUrl: 'https://example.com/photo.jpg' }),
    );

    await records.delete({ id: record.id });

    const remaining = await photos.findOneBy({ id: photo.id });
    expect(remaining).toBeNull();
  });

  it('trip_places의 place는 SET NULL이라 place가 삭제돼도 계획 항목은 남는다', async () => {
    const users = dataSource.getRepository(User);
    const trips = dataSource.getRepository(Trip);
    const places = dataSource.getRepository(Place);
    const tripPlaces = dataSource.getRepository(TripPlace);

    const user = await users.save(users.create({ nickname: '플래너' }));
    const trip = await trips.save(
      trips.create({
        ownerId: user.id,
        title: '서울 여행',
        cityName: '서울',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
      }),
    );
    const place = await places.save(places.create({ name: '경복궁' }));
    const tripPlace = await tripPlaces.save(
      tripPlaces.create({
        tripId: trip.id,
        placeId: place.id,
        dayNumber: 1,
        orderInDay: 1,
        addedBy: user.id,
      }),
    );

    await places.delete({ id: place.id });

    const found = await tripPlaces.findOneByOrFail({ id: tripPlace.id });
    expect(found.placeId).toBeNull();
  });
});
