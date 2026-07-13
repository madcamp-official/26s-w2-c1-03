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
    imageUrl: null,
    ...overrides,
  };
}

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
  let placesService: { resolveForSchedule: jest.Mock; recommendAdditionalForSchedule: jest.Mock };
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
      recommendAdditionalForSchedule: jest.fn(async () => []),
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

  it('AI 결과대로 일자별로 배치하고 기존 항목을 지운 뒤 저장한 스케줄을 반환한다', async () => {
    placesService.resolveForSchedule.mockResolvedValue([
      buildInfo('p1'),
      buildInfo('p2'),
      buildInfo('p3'),
    ]);
    const aiResult: ScheduleAiResult = {
      days: [
        { dayNumber: 1, placeIds: ['p1', 'p2'] },
        { dayNumber: 2, placeIds: ['p3'] },
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
      expect.objectContaining({ durationDays: 2, targetPlaceCount: 3 }),
    );

    expect(schedule.days).toHaveLength(2);
    expect(schedule.days[0]).toMatchObject({ dayNumber: 1 });
    expect(schedule.days[0].places.map((p) => p.placeId)).toEqual(['p1', 'p2']);
    expect(schedule.days[0].places.map((p) => p.orderInDay)).toEqual([1, 2]);
    expect(schedule.days[1].places.map((p) => p.placeId)).toEqual(['p3']);
    // 장소 정보(이름/주소)가 DTO에 채워진다.
    expect(schedule.days[0].places[0]).toMatchObject({ name: 'place-p1', address: '주소-p1' });
  });

  it('AI가 누락한 장소는 마지막 날에 이어 붙여 선택 장소가 모두 포함되게 한다', async () => {
    placesService.resolveForSchedule.mockResolvedValue([
      buildInfo('p1'),
      buildInfo('p2'),
      buildInfo('p3'),
    ]);
    // p3를 AI가 빠뜨림
    scheduleAiClient.requestSchedule.mockResolvedValue({
      days: [{ dayNumber: 1, placeIds: ['p1', 'p2'] }],
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

  it('선택 장소 외 지역 추천 후보를 함께 AI에 넘겨 완성된 일정을 만든다', async () => {
    placesService.resolveForSchedule.mockResolvedValue([buildInfo('p1'), buildInfo('p2')]);
    placesService.recommendAdditionalForSchedule.mockResolvedValue([
      buildInfo('r1'),
      buildInfo('r2'),
      buildInfo('r3'),
      buildInfo('r4'),
      buildInfo('r5'),
      buildInfo('r6'),
    ]);
    scheduleAiClient.requestSchedule.mockResolvedValue({
      days: [
        { dayNumber: 1, placeIds: ['p1', 'r1', 'r2', 'r3'] },
        { dayNumber: 2, placeIds: ['p2', 'r4', 'r5', 'r6'] },
      ],
    });

    const { schedule } = await service.generate('trip-1', 'user-1', {
      selectedPlaceIds: ['p1', 'p2'],
    });

    expect(placesService.recommendAdditionalForSchedule).toHaveBeenCalledWith(
      'trip-1',
      'user-1',
      ['p1', 'p2'],
      6,
    );
    expect(scheduleAiClient.requestSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        targetPlaceCount: 8,
        places: expect.arrayContaining([
          expect.objectContaining({ id: 'p1', isRequired: true }),
          expect.objectContaining({ id: 'p2', isRequired: true }),
          expect.objectContaining({ id: 'r1', isRequired: false }),
        ]),
      }),
    );
    const allPlaceIds = schedule.days.flatMap((day) => day.places.map((p) => p.placeId));
    expect(allPlaceIds).toEqual(['p1', 'r1', 'r2', 'r3', 'p2', 'r4', 'r5', 'r6']);
  });

  it('여행 일수를 넘는 dayNumber는 마지막 날로 클램프한다', async () => {
    placesService.resolveForSchedule.mockResolvedValue([buildInfo('p1')]);
    // 2일 여행인데 AI가 5일차로 배치
    scheduleAiClient.requestSchedule.mockResolvedValue({
      days: [{ dayNumber: 5, placeIds: ['p1'] }],
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
