import { TravelRecord, TravelRecordStatus } from './entities/travel-record.entity';
import { RecordsService } from './records.service';

type RepoMock<T extends object> = {
  [K in keyof import('typeorm').Repository<T>]?: jest.Mock;
};

function createRepositoryMock<T extends object>(): RepoMock<T> {
  return {
    create: jest.fn((entity) => entity),
    save: jest.fn(async (entity) => entity),
    findOneBy: jest.fn(),
  };
}

function buildRecord(overrides: Partial<TravelRecord> = {}): TravelRecord {
  return {
    id: 'record-1',
    tripId: 'trip-1',
    trip: undefined as never,
    userId: 'user-1',
    user: undefined as never,
    title: null,
    content: null,
    status: TravelRecordStatus.DRAFT,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    photos: [],
    ...overrides,
  };
}

describe('RecordsService', () => {
  let travelRecordRepository: RepoMock<TravelRecord>;
  let tripsService: { assertMember: jest.Mock };
  let service: RecordsService;

  beforeEach(() => {
    travelRecordRepository = createRepositoryMock<TravelRecord>();
    tripsService = { assertMember: jest.fn().mockResolvedValue(undefined) };
    service = new RecordsService(travelRecordRepository as never, tripsService as never);
  });

  describe('startSession', () => {
    it('트립 멤버가 아니면 assertMember가 던지는 예외를 그대로 전파하고 조회조차 하지 않는다', async () => {
      tripsService.assertMember.mockRejectedValue(new Error('forbidden'));

      await expect(service.startSession('trip-1', 'user-1')).rejects.toThrow('forbidden');
      expect(travelRecordRepository.findOneBy).not.toHaveBeenCalled();
    });

    it('기존 레코드가 있으면 새로 만들지 않고 그대로 반환한다', async () => {
      const existing = buildRecord({ status: TravelRecordStatus.PUBLISHED, title: '오사카 여행' });
      travelRecordRepository.findOneBy!.mockResolvedValue(existing);

      const result = await service.startSession('trip-1', 'user-1');

      expect(result).toMatchObject({
        id: 'record-1',
        status: TravelRecordStatus.PUBLISHED,
        title: '오사카 여행',
      });
      expect(travelRecordRepository.create).not.toHaveBeenCalled();
      expect(travelRecordRepository.save).not.toHaveBeenCalled();
    });

    it('기존 레코드가 없으면 draft 상태로 새로 만든다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(null);

      const result = await service.startSession('trip-1', 'user-1');

      expect(travelRecordRepository.create).toHaveBeenCalledWith({
        tripId: 'trip-1',
        userId: 'user-1',
        status: TravelRecordStatus.DRAFT,
      });
      expect(result.status).toBe(TravelRecordStatus.DRAFT);
    });
  });
});
