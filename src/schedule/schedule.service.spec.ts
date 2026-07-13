import { ScheduleAiResult } from './client/open-ai-schedule.client';
import { ScheduleService } from './schedule.service';
import { TripMemberRole } from '../trips/entities/trip-member.entity';
import { ScheduledPlaceInfo } from '../places/places.service';

function buildInfo(id: string, overrides: Partial<ScheduledPlaceInfo> = {}): ScheduledPlaceInfo {
  return {
    id,
    name: `place-${id}`,
    address: `주소-${id}`,
    lat: 37.5,
    lng: 127.0,
    categoryCode: 'A01',
    category: 'attraction',
    imageUrl: null,
    ...overrides,
  };
}

function buildRestaurant(id: string): ScheduledPlaceInfo {
  return buildInfo(id, { category: 'restaurant', categoryCode: 'A05020100' });
}

const emptyPools = { attractions: [], restaurants: [], cafes: [] };

/**
 * 트랜잭션 매니저 목 — delete/create/save만 쓴다. create는 저장 시 부여될 id를 흉내내
 * 순번 id를 붙이고, save는 받은 행을 그대로 돌려준다(실제 저장 없이 배정 로직만 검증).
 */
function createManagerMock() {
  let seq = 0;
  return {
    delete: jest.fn(async () => ({ affected: 0 })),
    create: jest.fn((_entity: unknown, data: Record<string, unknown>) => ({
      id: `tp-${++seq}`,
      customName: null,
      customAddress: null,
      memo: null,
      ...data,
    })),
    save: jest.fn(async (rows: unknown) => rows),
  };
}

describe('ScheduleService', () => {
  let tripsService: { getDetail: jest.Mock; assertMember: jest.Mock };
  let placesService: { resolveForSchedule: jest.Mock; getScheduleCandidatePools: jest.Mock };
  let scheduleAiClient: { requestSchedule: jest.Mock; requestRevision: jest.Mock };
  let manager: ReturnType<typeof createManagerMock>;
  let dataSource: { transaction: jest.Mock };
  let service: ScheduleService;

  beforeEach(() => {
    tripsService = {
      // 2일 여행(2026-07-13 ~ 2026-07-14)
      getDetail: jest.fn(async () => ({ startDate: '2026-07-13', endDate: '2026-07-14' })),
      assertMember: jest.fn(async () => ({})),
    };
    placesService = {
      resolveForSchedule: jest.fn(),
      getScheduleCandidatePools: jest.fn(async () => emptyPools),
    };
    scheduleAiClient = { requestSchedule: jest.fn(), requestRevision: jest.fn() };
    manager = createManagerMock();
    dataSource = { transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(manager)) };

    service = new ScheduleService(
      dataSource as never,
      tripsService as never,
      placesService as never,
      scheduleAiClient as never,
    );
  });

  it('AI 결과대로 일자·시간순으로 배치하고 기존 항목을 지운 뒤 저장한 스케줄을 반환한다', async () => {
    placesService.resolveForSchedule.mockResolvedValue([
      buildInfo('p1'),
      buildInfo('p2'),
      buildInfo('p3'),
    ]);
    const aiResult: ScheduleAiResult = {
      days: [
        {
          dayNumber: 1,
          entries: [
            { placeId: 'p2', startTime: '14:00' },
            { placeId: 'p1', startTime: '10:00' },
          ],
        },
        { dayNumber: 2, entries: [{ placeId: 'p3', startTime: null }] },
      ],
    };
    scheduleAiClient.requestSchedule.mockResolvedValue(aiResult);

    const { schedule } = await service.generate('trip-1', 'user-1', {
      selectedPlaceIds: ['p1', 'p2', 'p3'],
    });

    // owner/editor 역할까지 검증한다.
    expect(tripsService.assertMember).toHaveBeenCalledWith('trip-1', 'user-1', [
      TripMemberRole.OWNER,
      TripMemberRole.EDITOR,
    ]);
    // 재생성 대비: 기존 trip_places를 먼저 지운다.
    expect(manager.delete).toHaveBeenCalledWith(expect.anything(), { tripId: 'trip-1' });
    // 여행 일수(2일)를 AI에 전달한다.
    expect(scheduleAiClient.requestSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ durationDays: 2 }),
    );

    expect(schedule.days).toHaveLength(2);
    // 하루 안에서는 startTime 순으로 재정렬된다(p1 10:00 → p2 14:00).
    expect(schedule.days[0].places.map((p) => p.placeId)).toEqual(['p1', 'p2']);
    expect(schedule.days[0].places.map((p) => p.startTime)).toEqual(['10:00', '14:00']);
    expect(schedule.days[0].places.map((p) => p.orderInDay)).toEqual([1, 2]);
    expect(schedule.days[1].places.map((p) => p.placeId)).toEqual(['p3']);
    // 장소 정보(이름/주소)가 DTO에 채워진다.
    expect(schedule.days[0].places[0]).toMatchObject({ name: 'place-p1', address: '주소-p1' });
  });

  it('AI가 누락한 필수 장소는 마지막 날에 이어 붙여 선택 장소가 모두 포함되게 한다', async () => {
    placesService.resolveForSchedule.mockResolvedValue([
      buildInfo('p1'),
      buildInfo('p2'),
      buildInfo('p3'),
    ]);
    // p3를 AI가 빠뜨림
    scheduleAiClient.requestSchedule.mockResolvedValue({
      days: [
        {
          dayNumber: 1,
          entries: [
            { placeId: 'p1', startTime: '10:00' },
            { placeId: 'p2', startTime: '14:00' },
          ],
        },
      ],
    });

    const { schedule } = await service.generate('trip-1', 'user-1', {
      selectedPlaceIds: ['p1', 'p2', 'p3'],
    });

    const allPlaceIds = schedule.days.flatMap((day) => day.places.map((p) => p.placeId));
    expect(allPlaceIds.sort()).toEqual(['p1', 'p2', 'p3']);
    // 누락분 p3는 마지막 날(durationDays=2)에 붙는다.
    const lastDay = schedule.days.find((day) => day.dayNumber === 2);
    expect(lastDay?.places.map((p) => p.placeId)).toContain('p3');
  });

  it('선택 장소 외 카테고리별 후보 풀(관광지·식당·카페)을 함께 AI에 넘긴다', async () => {
    placesService.resolveForSchedule.mockResolvedValue([buildInfo('p1'), buildInfo('p2')]);
    placesService.getScheduleCandidatePools.mockResolvedValue({
      attractions: [buildInfo('a1'), buildInfo('a2')],
      restaurants: [buildRestaurant('r1'), buildRestaurant('r2')],
      cafes: [buildInfo('c1', { category: 'cafe' })],
    });
    scheduleAiClient.requestSchedule.mockResolvedValue({
      days: [
        {
          dayNumber: 1,
          entries: [
            { placeId: 'p1', startTime: '10:00' },
            { placeId: 'r1', startTime: '12:00' },
            { placeId: 'a1', startTime: '14:00' },
            { placeId: 'r2', startTime: '18:00' },
          ],
        },
        {
          dayNumber: 2,
          entries: [
            { placeId: 'p2', startTime: '10:00' },
            { placeId: 'c1', startTime: '15:00' },
            { placeId: 'a2', startTime: '16:00' },
          ],
        },
      ],
    });

    const { schedule } = await service.generate('trip-1', 'user-1', {
      selectedPlaceIds: ['p1', 'p2'],
    });

    // 2일 여행: 관광지 2*3-2+2=6, 식당 2*2*2=8, 카페 2+2=4곳 한도로 풀을 요청한다.
    expect(placesService.getScheduleCandidatePools).toHaveBeenCalledWith(
      'trip-1',
      'user-1',
      [
        { lat: 37.5, lng: 127.0 },
        { lat: 37.5, lng: 127.0 },
      ],
      ['p1', 'p2'],
      { attractions: 6, restaurants: 8, cafes: 4 },
    );
    expect(scheduleAiClient.requestSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        places: expect.arrayContaining([
          expect.objectContaining({ id: 'p1', isRequired: true, category: 'attraction' }),
          expect.objectContaining({ id: 'r1', isRequired: false, category: 'restaurant' }),
          expect.objectContaining({ id: 'c1', isRequired: false, category: 'cafe' }),
        ]),
      }),
    );
    const allPlaceIds = schedule.days.flatMap((day) => day.places.map((p) => p.placeId));
    expect(allPlaceIds).toEqual(['p1', 'r1', 'a1', 'r2', 'p2', 'c1', 'a2']);
  });

  it('AI가 식당을 빠뜨린 날은 남은 후보 식당으로 점심·저녁을 보정 삽입한다', async () => {
    placesService.resolveForSchedule.mockResolvedValue([buildInfo('p1'), buildInfo('p2')]);
    placesService.getScheduleCandidatePools.mockResolvedValue({
      attractions: [],
      restaurants: [buildRestaurant('r1'), buildRestaurant('r2'), buildRestaurant('r3')],
      cafes: [],
    });
    // 1일차엔 식당이 아예 없고, 2일차엔 점심(12:30) 식당만 있다.
    scheduleAiClient.requestSchedule.mockResolvedValue({
      days: [
        { dayNumber: 1, entries: [{ placeId: 'p1', startTime: '10:00' }] },
        {
          dayNumber: 2,
          entries: [
            { placeId: 'p2', startTime: '10:00' },
            { placeId: 'r3', startTime: '12:30' },
          ],
        },
      ],
    });

    const { schedule } = await service.generate('trip-1', 'user-1', {
      selectedPlaceIds: ['p1', 'p2'],
    });

    // 1일차: 점심(12:00)+저녁(18:00) 식당이 시간순으로 삽입된다.
    const day1 = schedule.days.find((day) => day.dayNumber === 1)!;
    expect(day1.places.map((p) => [p.placeId, p.startTime])).toEqual([
      ['p1', '10:00'],
      ['r1', '12:00'],
      ['r2', '18:00'],
    ]);
    // 2일차: 점심은 이미 있으므로 저녁만 보정된다.
    const day2 = schedule.days.find((day) => day.dayNumber === 2)!;
    expect(day2.places.map((p) => [p.placeId, p.startTime])).toEqual([
      ['p2', '10:00'],
      ['r3', '12:30'],
      // r1/r2는 1일차에서 소진돼 남은 식당이 없으면 보정하지 않지만, 여기선 풀이 3개라 없음.
    ]);
  });

  it('여행 일수를 넘는 dayNumber는 마지막 날로 클램프한다', async () => {
    placesService.resolveForSchedule.mockResolvedValue([buildInfo('p1')]);
    // 2일 여행인데 AI가 5일차로 배치
    scheduleAiClient.requestSchedule.mockResolvedValue({
      days: [{ dayNumber: 5, entries: [{ placeId: 'p1', startTime: '10:00' }] }],
    });

    const { schedule } = await service.generate('trip-1', 'user-1', {
      selectedPlaceIds: ['p1'],
    });

    expect(schedule.days).toHaveLength(1);
    expect(schedule.days[0].dayNumber).toBe(2);
  });

  it('존재하지 않는 place가 섞여 있으면 SELECTED_PLACES_INVALID를 던지고 AI를 호출하지 않는다', async () => {
    // 3개 요청했는데 2개만 조회됨
    placesService.resolveForSchedule.mockResolvedValue([buildInfo('p1'), buildInfo('p2')]);

    await expect(
      service.generate('trip-1', 'user-1', { selectedPlaceIds: ['p1', 'p2', 'p3'] }),
    ).rejects.toMatchObject({ code: 'SELECTED_PLACES_INVALID' });

    expect(scheduleAiClient.requestSchedule).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('AI 클라이언트 실패는 그대로 전파되고 저장을 시도하지 않는다', async () => {
    placesService.resolveForSchedule.mockResolvedValue([buildInfo('p1')]);
    scheduleAiClient.requestSchedule.mockRejectedValue(
      Object.assign(new Error('fail'), { code: 'OPENAI_REQUEST_FAILED' }),
    );

    await expect(
      service.generate('trip-1', 'user-1', { selectedPlaceIds: ['p1'] }),
    ).rejects.toMatchObject({ code: 'OPENAI_REQUEST_FAILED' });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  // ── Phase 9 수동 편집 ────────────────────────────────────────────────────
  // 트랜잭션 안에서 repo.find가 돌려준 행 객체를 직접 수정·저장하는 구현이므로,
  // 인메모리 rows 배열을 공유하는 repo 목으로 최종 상태를 검증한다.

  interface RowLike {
    id: string;
    tripId: string;
    placeId: string | null;
    dayNumber: number;
    orderInDay: number;
    startTime: string | null;
    customName: string | null;
    customAddress: string | null;
    memo: string | null;
    addedBy: string;
  }

  function buildRow(id: string, dayNumber: number, orderInDay: number): RowLike {
    return {
      id,
      tripId: 'trip-1',
      placeId: null,
      dayNumber,
      orderInDay,
      startTime: null,
      customName: `이름-${id}`,
      customAddress: null,
      memo: null,
      addedBy: 'user-1',
    };
  }

  function setupEditRepo(rows: RowLike[]) {
    let seq = 0;
    const repo = {
      find: jest.fn(async () => [...rows]),
      create: jest.fn((data: Record<string, unknown>) => {
        const created = { id: `tp-new-${++seq}`, ...data } as unknown as RowLike;
        rows.push(created);
        return created;
      }),
      save: jest.fn(async (toSave: unknown) => toSave),
      remove: jest.fn(async (row: RowLike) => {
        rows.splice(rows.indexOf(row), 1);
        return row;
      }),
    };
    (manager as unknown as { getRepository: jest.Mock }).getRepository = jest.fn(() => repo);
    // reorder가 마지막에 getSchedule로 전체 뷰를 다시 읽는다.
    (dataSource as unknown as { getRepository: jest.Mock }).getRepository = jest.fn(() => ({
      find: jest.fn(async () =>
        [...rows].sort((a, b) => a.dayNumber - b.dayNumber || a.orderInDay - b.orderInDay),
      ),
    }));
    placesService.resolveForSchedule.mockResolvedValue([]);
    return repo;
  }

  it('addPlace: customName 장소를 그날 맨 뒤에 추가한다', async () => {
    const rows = [buildRow('t1', 1, 1), buildRow('t2', 1, 2)];
    setupEditRepo(rows);

    const { tripPlace } = await service.addPlace('trip-1', 'user-1', {
      customName: '수동 맛집',
      customAddress: '제주 어딘가',
      dayNumber: 1,
    });

    expect(tripPlace).toMatchObject({
      name: '수동 맛집',
      address: '제주 어딘가',
      dayNumber: 1,
      orderInDay: 3,
      placeId: null,
    });
  });

  it('addPlace: orderInDay를 지정하면 그 위치에 끼워 넣고 기존 항목을 밀어낸다', async () => {
    const rows = [buildRow('t1', 1, 1), buildRow('t2', 1, 2)];
    setupEditRepo(rows);

    const { tripPlace } = await service.addPlace('trip-1', 'user-1', {
      customName: '새 장소',
      dayNumber: 1,
      orderInDay: 1,
    });

    expect(tripPlace.orderInDay).toBe(1);
    const day1 = rows
      .filter((row) => row.dayNumber === 1)
      .sort((a, b) => a.orderInDay - b.orderInDay);
    expect(day1.map((row) => [row.customName, row.orderInDay])).toEqual([
      ['새 장소', 1],
      ['이름-t1', 2],
      ['이름-t2', 3],
    ]);
  });

  it('addPlace: placeId와 customName 둘 다(또는 둘 다 없이) 주면 SCHEDULE_PLACE_INPUT_INVALID', async () => {
    setupEditRepo([]);
    await expect(
      service.addPlace('trip-1', 'user-1', {
        placeId: '4c2f9c8e-0000-0000-0000-000000000001',
        customName: '중복 입력',
        dayNumber: 1,
      }),
    ).rejects.toMatchObject({ code: 'SCHEDULE_PLACE_INPUT_INVALID' });
    await expect(
      service.addPlace('trip-1', 'user-1', { dayNumber: 1 }),
    ).rejects.toMatchObject({ code: 'SCHEDULE_PLACE_INPUT_INVALID' });
  });

  it('addPlace: 여행 일수(2일)를 벗어난 dayNumber는 거부한다', async () => {
    setupEditRepo([]);
    await expect(
      service.addPlace('trip-1', 'user-1', { customName: '장소', dayNumber: 3 }),
    ).rejects.toMatchObject({ code: 'SCHEDULE_PLACE_INPUT_INVALID' });
  });

  it('updatePlace: memo만 수정하면 위치는 그대로 두고, null이면 메모를 지운다', async () => {
    const rows = [buildRow('t1', 1, 1)];
    rows[0].memo = '기존 메모';
    setupEditRepo(rows);

    const { tripPlace } = await service.updatePlace('trip-1', 'user-1', 't1', { memo: null });

    expect(tripPlace.memo).toBeNull();
    expect(rows[0]).toMatchObject({ dayNumber: 1, orderInDay: 1 });
  });

  it('updatePlace: 다른 날로 이동하면 원래 날과 대상 날 모두 1..n으로 재부여된다', async () => {
    const rows = [
      buildRow('t1', 1, 1),
      buildRow('t2', 1, 2),
      buildRow('t3', 2, 1),
    ];
    setupEditRepo(rows);

    // t1을 2일차 1번 위치로 이동
    await service.updatePlace('trip-1', 'user-1', 't1', { dayNumber: 2, orderInDay: 1 });

    const snapshot = rows.map((row) => [row.id, row.dayNumber, row.orderInDay]);
    expect(snapshot).toEqual(
      expect.arrayContaining([
        ['t1', 2, 1],
        ['t3', 2, 2],
        ['t2', 1, 1], // 1일차가 당겨진다
      ]),
    );
  });

  it('updatePlace: 없는 tripPlaceId는 TRIP_PLACE_NOT_FOUND', async () => {
    setupEditRepo([buildRow('t1', 1, 1)]);
    await expect(
      service.updatePlace('trip-1', 'user-1', 'ghost', { memo: 'x' }),
    ).rejects.toMatchObject({ code: 'TRIP_PLACE_NOT_FOUND' });
  });

  it('removePlace: 행을 지우고 그날 순번을 압축한다', async () => {
    const rows = [buildRow('t1', 1, 1), buildRow('t2', 1, 2), buildRow('t3', 1, 3)];
    const repo = setupEditRepo(rows);

    await service.removePlace('trip-1', 'user-1', 't2');

    expect(repo.remove).toHaveBeenCalled();
    const snapshot = rows.map((row) => [row.id, row.orderInDay]);
    expect(snapshot).toEqual([
      ['t1', 1],
      ['t3', 2],
    ]);
  });

  it('reorder: 일괄 operations를 적용하고 day별 1..n으로 재부여된 전체 스케줄을 반환한다', async () => {
    const rows = [
      buildRow('t1', 1, 1),
      buildRow('t2', 1, 2),
      buildRow('t3', 2, 1),
    ];
    setupEditRepo(rows);

    // t3을 1일차 맨 앞으로, t1을 2일차로
    const { schedule } = await service.reorder('trip-1', 'user-1', {
      operations: [
        { tripPlaceId: 't3', dayNumber: 1, orderInDay: 1 },
        { tripPlaceId: 't1', dayNumber: 2, orderInDay: 1 },
      ],
    });

    expect(schedule.days).toHaveLength(2);
    expect(schedule.days[0].places.map((p) => [p.id, p.orderInDay])).toEqual([
      ['t3', 1],
      ['t2', 2],
    ]);
    expect(schedule.days[1].places.map((p) => [p.id, p.orderInDay])).toEqual([['t1', 1]]);
  });

  it('reorder: 없는 tripPlaceId가 섞이면 TRIP_PLACE_NOT_FOUND를 던진다', async () => {
    setupEditRepo([buildRow('t1', 1, 1)]);
    await expect(
      service.reorder('trip-1', 'user-1', {
        operations: [{ tripPlaceId: 'ghost', dayNumber: 1, orderInDay: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'TRIP_PLACE_NOT_FOUND' });
  });

  it('reorder: 여행 일수를 벗어난 dayNumber는 SCHEDULE_PLACE_INPUT_INVALID', async () => {
    setupEditRepo([buildRow('t1', 1, 1)]);
    await expect(
      service.reorder('trip-1', 'user-1', {
        operations: [{ tripPlaceId: 't1', dayNumber: 9, orderInDay: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'SCHEDULE_PLACE_INPUT_INVALID' });
  });

  // ── Phase 9 AI 재수정(revise/apply) ─────────────────────────────────────

  function setupReviseRepos(rows: RowLike[]) {
    const aiRequestRepo = {
      create: jest.fn((data: Record<string, unknown>) => ({ ...data })),
      save: jest.fn(async (req: Record<string, unknown>) => ({ id: 'req-1', ...req })),
    };
    const tripPlaceRepo = { find: jest.fn(async () => [...rows]) };
    (dataSource as unknown as { getRepository: jest.Mock }).getRepository = jest.fn(
      (entity: unknown) =>
        (entity as { name?: string }).name === 'AiPlanRequest' ? aiRequestRepo : tripPlaceRepo,
    );
    return { aiRequestRepo, tripPlaceRepo };
  }

  it('revise: 저장 없이 제안을 반환하고(placeId/custom/후보 매핑) 이력을 기록한다', async () => {
    const placeRow = { ...buildRow('t1', 1, 1), placeId: 'pl-a', customName: null };
    const customRow = buildRow('t2', 1, 2); // placeId 없음 → custom:t2로 참조
    const { aiRequestRepo } = setupReviseRepos([placeRow, customRow]);
    placesService.resolveForSchedule.mockResolvedValue([buildInfo('pl-a')]);
    placesService.getScheduleCandidatePools.mockResolvedValue({
      attractions: [],
      restaurants: [buildRestaurant('cand-r')],
      cafes: [],
    });
    scheduleAiClient.requestRevision.mockResolvedValue({
      days: [
        {
          dayNumber: 1,
          entries: [
            { placeId: 'pl-a', startTime: '10:00' },
            { placeId: 'custom:t2', startTime: '12:00' },
            { placeId: 'cand-r', startTime: '18:00' },
            { placeId: 'custom:ghost', startTime: '20:00' }, // 사라진 행 → 제안에서 제외
          ],
        },
      ],
    });

    const { requestId, proposal } = await service.revise('trip-1', 'user-1', {
      prompt: '저녁에 식당 하나 추가해줘',
    });

    // 현재 일정이 custom: 접두 id로 AI에 전달된다.
    expect(scheduleAiClient.requestRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: '저녁에 식당 하나 추가해줘',
        current: expect.arrayContaining([
          expect.objectContaining({ id: 'pl-a' }),
          expect.objectContaining({ id: 'custom:t2', name: '이름-t2' }),
        ]),
      }),
    );
    expect(requestId).toBe('req-1');
    expect(aiRequestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ promptText: '저녁에 식당 하나 추가해줘' }),
    );
    // trip_places 저장(트랜잭션)은 일어나지 않는다 — 미리보기만.
    expect(dataSource.transaction).not.toHaveBeenCalled();

    expect(proposal.days).toHaveLength(1);
    expect(proposal.days[0].places.map((p) => [p.placeId, p.customName, p.orderInDay])).toEqual([
      ['pl-a', null, 1],
      [null, '이름-t2', 2],
      ['cand-r', null, 3],
    ]);
  });

  it('applyRevision: 확인된 항목으로 전체를 교체하고 day별 1..n으로 재부여한다', async () => {
    placesService.resolveForSchedule.mockResolvedValue([buildInfo('p1'), buildInfo('p2')]);

    const { schedule } = await service.applyRevision('trip-1', 'user-1', {
      items: [
        { placeId: 'p1', dayNumber: 1, orderInDay: 5, startTime: '10:00' },
        { customName: '내가 아는 맛집', dayNumber: 1, orderInDay: 7 },
        { placeId: 'p2', dayNumber: 2, orderInDay: 1 },
      ],
    });

    expect(manager.delete).toHaveBeenCalledWith(expect.anything(), { tripId: 'trip-1' });
    expect(schedule.days[0].places.map((p) => [p.placeId, p.name, p.orderInDay, p.startTime])).toEqual([
      ['p1', 'place-p1', 1, '10:00'],
      [null, '내가 아는 맛집', 2, null],
    ]);
    expect(schedule.days[1].places.map((p) => [p.placeId, p.orderInDay])).toEqual([['p2', 1]]);
  });

  it('applyRevision: placeId·customName 동시 입력이나 없는 placeId는 거부한다', async () => {
    await expect(
      service.applyRevision('trip-1', 'user-1', {
        items: [{ placeId: 'p1', customName: '둘 다', dayNumber: 1, orderInDay: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'SCHEDULE_PLACE_INPUT_INVALID' });

    placesService.resolveForSchedule.mockResolvedValue([]); // p1 조회 실패
    await expect(
      service.applyRevision('trip-1', 'user-1', {
        items: [{ placeId: 'p1', dayNumber: 1, orderInDay: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'SELECTED_PLACES_INVALID' });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('listAiRequests: 이력을 최신순 그대로 매핑해 반환한다', async () => {
    const createdAt = new Date('2026-07-13T12:00:00Z');
    (dataSource as unknown as { getRepository: jest.Mock }).getRepository = jest.fn(() => ({
      find: jest.fn(async () => [
        {
          id: 'req-1',
          promptText: '카페 추가',
          responseSummary: '2일 / 9곳 수정 제안',
          requestedBy: 'user-1',
          createdAt,
        },
      ]),
    }));

    const { items } = await service.listAiRequests('trip-1', 'user-1');

    expect(items).toEqual([
      {
        id: 'req-1',
        promptText: '카페 추가',
        responseSummary: '2일 / 9곳 수정 제안',
        requestedBy: 'user-1',
        createdAt: createdAt.toISOString(),
      },
    ]);
  });
});
