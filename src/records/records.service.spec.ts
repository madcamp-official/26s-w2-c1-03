import { RecordPhotoRef, RecordPhotoRefStatus } from './entities/record-photo-ref.entity';
import { TravelRecord, TravelRecordStatus } from './entities/travel-record.entity';
import { RecordsService } from './records.service';

type RepoMock<T extends object> = {
  [K in keyof import('typeorm').Repository<T>]?: jest.Mock;
};

function createRepositoryMock<T extends object>(): RepoMock<T> {
  return {
    create: jest.fn((entity) => entity),
    // 실제 TypeORM은 insert 시 DB가 gen_random_uuid()로 id를 채워 돌려준다 —
    // create()만으로는 id가 없으므로 save() 단계에서 흉내낸다.
    save: jest.fn(async (entity) => ({ id: 'ref-1', ...entity })),
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

function buildPhotoRef(overrides: Partial<RecordPhotoRef> = {}): RecordPhotoRef {
  return {
    id: 'ref-1',
    recordId: 'record-1',
    record: undefined as never,
    localId: 'local-1',
    takenAt: new Date('2026-07-16T09:00:00Z'),
    locationName: '오사카',
    status: RecordPhotoRefStatus.PENDING,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('RecordsService', () => {
  let travelRecordRepository: RepoMock<TravelRecord>;
  let recordPhotoRefRepository: RepoMock<RecordPhotoRef>;
  let tripsService: { assertMember: jest.Mock };
  let service: RecordsService;

  beforeEach(() => {
    travelRecordRepository = createRepositoryMock<TravelRecord>();
    recordPhotoRefRepository = createRepositoryMock<RecordPhotoRef>();
    tripsService = { assertMember: jest.fn().mockResolvedValue(undefined) };
    service = new RecordsService(
      travelRecordRepository as never,
      recordPhotoRefRepository as never,
      tripsService as never,
    );
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

  describe('registerMetadata', () => {
    const dto = {
      photos: [{ localId: 'local-1', takenAt: '2026-07-16T09:00:00Z', locationName: '오사카' }],
    };

    it('레코드가 없으면 RECORD_NOT_FOUND를 던지고 photoRef를 조회하지 않는다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(null);

      await expect(
        service.registerMetadata('trip-1', 'record-1', 'user-1', dto),
      ).rejects.toMatchObject({
        code: 'RECORD_NOT_FOUND',
      });
      expect(recordPhotoRefRepository.findOneBy).not.toHaveBeenCalled();
    });

    it('본인 기록이 아니면 RECORD_FORBIDDEN을 던진다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord({ userId: 'other-user' }));

      await expect(
        service.registerMetadata('trip-1', 'record-1', 'user-1', dto),
      ).rejects.toMatchObject({
        code: 'RECORD_FORBIDDEN',
      });
    });

    it('처음 등록하는 localId면 새 photoRef를 만들어 photoRefId를 발급한다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRefRepository.findOneBy!.mockResolvedValue(null);

      const result = await service.registerMetadata('trip-1', 'record-1', 'user-1', dto);

      expect(recordPhotoRefRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recordId: 'record-1',
          localId: 'local-1',
          status: RecordPhotoRefStatus.PENDING,
        }),
      );
      expect(result.photos).toEqual([{ photoRefId: 'ref-1', localId: 'local-1' }]);
    });

    it('이미 등록된 localId면 새로 만들지 않고 메타데이터만 갱신한다', async () => {
      const existingRef = buildPhotoRef({ locationName: '이전 지명' });
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRefRepository.findOneBy!.mockResolvedValue(existingRef);

      const result = await service.registerMetadata('trip-1', 'record-1', 'user-1', dto);

      expect(recordPhotoRefRepository.create).not.toHaveBeenCalled();
      expect(recordPhotoRefRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ref-1', locationName: '오사카' }),
      );
      expect(result.photos).toEqual([{ photoRefId: 'ref-1', localId: 'local-1' }]);
    });
  });
});
