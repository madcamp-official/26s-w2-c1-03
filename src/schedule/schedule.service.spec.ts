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
  let scheduleAiClient: { requestSchedule: jest.Mock };
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
    scheduleAiClient = { requestSchedule: jest.fn() };
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
});
