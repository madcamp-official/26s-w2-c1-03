import * as fsSync from 'fs';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RecordPhotoRef, RecordPhotoRefStatus } from './entities/record-photo-ref.entity';
import { TravelRecord, TravelRecordStatus } from './entities/travel-record.entity';
import { RecordsService } from './records.service';

// curate()의 stripExif가 실제 sharp로 이미지를 재인코딩하는데, 유닛테스트에서는
// 진짜 JPEG 바이트가 없으므로 입력을 그대로 통과시키는 스텁으로 대체한다 —
// EXIF 스트립 자체의 정확성은 sharp 라이브러리 몫이라 여기서 검증하지 않는다.
jest.mock('sharp', () => {
  return jest.fn((buffer: Buffer) => ({
    jpeg: () => ({ toBuffer: async () => buffer }),
  }));
});

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
    findBy: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
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
    tempFilePath: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function buildFile(fieldname: string, content = 'fake-image-bytes'): Express.Multer.File {
  return {
    fieldname,
    originalname: `${fieldname}.jpg`,
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer: Buffer.from(content),
    size: content.length,
  } as Express.Multer.File;
}

describe('RecordsService', () => {
  let travelRecordRepository: RepoMock<TravelRecord>;
  let recordPhotoRefRepository: RepoMock<RecordPhotoRef>;
  let tripsService: { assertMember: jest.Mock };
  let configService: { getOrThrow: jest.Mock };
  let photoCurateAiClient: { selectBestPhotos: jest.Mock };
  let bufferDir: string;
  let service: RecordsService;

  beforeEach(async () => {
    travelRecordRepository = createRepositoryMock<TravelRecord>();
    recordPhotoRefRepository = createRepositoryMock<RecordPhotoRef>();
    tripsService = { assertMember: jest.fn().mockResolvedValue(undefined) };
    photoCurateAiClient = { selectBestPhotos: jest.fn() };

    bufferDir = await fs.mkdtemp(path.join(os.tmpdir(), 'record-photo-buffer-test-'));
    configService = {
      getOrThrow: jest.fn((key: string) => (key === 'PHOTO_TEMP_BUFFER_DIR' ? bufferDir : 30)),
    };

    service = new RecordsService(
      travelRecordRepository as never,
      recordPhotoRefRepository as never,
      tripsService as never,
      configService as never,
      photoCurateAiClient as never,
    );
  });

  afterEach(async () => {
    await fs.rm(bufferDir, { recursive: true, force: true });
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

  describe('uploadPhotos', () => {
    it('한 요청에 100장을 초과하면 VALIDATION_ERROR를 던지고 레코드 조회조차 하지 않는다', async () => {
      const files = Array.from({ length: 101 }, (_, i) => buildFile(`ref-${i}`));

      await expect(
        service.uploadPhotos('trip-1', 'record-1', 'user-1', files),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(travelRecordRepository.findOneBy).not.toHaveBeenCalled();
    });

    it('본인 기록이 아니면 RECORD_FORBIDDEN을 던진다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord({ userId: 'other-user' }));

      await expect(
        service.uploadPhotos('trip-1', 'record-1', 'user-1', [buildFile('ref-1')]),
      ).rejects.toMatchObject({ code: 'RECORD_FORBIDDEN' });
    });

    it('등록되지 않은 photoRefId(fieldname)는 조용히 건너뛴다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRefRepository.findBy!.mockResolvedValue([]);

      const result = await service.uploadPhotos('trip-1', 'record-1', 'user-1', [
        buildFile('unknown-ref'),
      ]);

      expect(result.uploaded).toEqual([]);
      expect(recordPhotoRefRepository.update).not.toHaveBeenCalled();
    });

    it('PENDING이 아닌 photoRef(이미 업로드됨)는 건너뛴다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRefRepository.findBy!.mockResolvedValue([
        buildPhotoRef({ id: 'ref-1', status: RecordPhotoRefStatus.UPLOADED }),
      ]);

      const result = await service.uploadPhotos('trip-1', 'record-1', 'user-1', [
        buildFile('ref-1'),
      ]);

      expect(result.uploaded).toEqual([]);
    });

    it('PENDING인 photoRef는 파일을 임시 버퍼에 쓰고 UPLOADED로 갱신한다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRefRepository.findBy!.mockResolvedValue([
        buildPhotoRef({ id: 'ref-1', status: RecordPhotoRefStatus.PENDING }),
      ]);

      const result = await service.uploadPhotos('trip-1', 'record-1', 'user-1', [
        buildFile('ref-1', 'hello-bytes'),
      ]);

      expect(result.uploaded).toEqual(['ref-1']);
      const writtenPath = path.join(bufferDir, 'ref-1');
      expect(fsSync.readFileSync(writtenPath, 'utf8')).toBe('hello-bytes');
      expect(recordPhotoRefRepository.update).toHaveBeenCalledWith(
        { id: 'ref-1' },
        { tempFilePath: writtenPath, status: RecordPhotoRefStatus.UPLOADED },
      );
    });
  });

  describe('curate', () => {
    async function writeTempFile(photoRefId: string, content = 'jpeg-bytes'): Promise<string> {
      const filePath = path.join(bufferDir, photoRefId);
      await fs.writeFile(filePath, content);
      return filePath;
    }

    it('UPLOADED 상태 사진이 없으면 빈 배열을 반환하고 AI를 호출하지 않는다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRefRepository.findBy!.mockResolvedValue([]);

      const result = await service.curate('trip-1', 'record-1', 'user-1');

      expect(result).toEqual({ recommended: [] });
      expect(photoCurateAiClient.selectBestPhotos).not.toHaveBeenCalled();
    });

    it('AI가 추천한 것만 RECOMMENDED로 갱신하고 나머지는 DISCARDED + 파일 삭제한다', async () => {
      const path1 = await writeTempFile('ref-1');
      const path2 = await writeTempFile('ref-2');
      const path3 = await writeTempFile('ref-3');

      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRefRepository.findBy!.mockResolvedValue([
        buildPhotoRef({
          id: 'ref-1',
          tempFilePath: path1,
          takenAt: new Date('2026-07-16T09:00:00Z'),
        }),
        buildPhotoRef({
          id: 'ref-2',
          tempFilePath: path2,
          takenAt: new Date('2026-07-16T10:00:00Z'),
        }),
        buildPhotoRef({
          id: 'ref-3',
          tempFilePath: path3,
          takenAt: new Date('2026-07-16T11:00:00Z'),
        }),
      ]);
      photoCurateAiClient.selectBestPhotos.mockResolvedValue({
        selectedPhotoRefIds: ['ref-2', 'ref-3'],
      });

      const result = await service.curate('trip-1', 'record-1', 'user-1');

      expect([...result.recommended].sort()).toEqual(['ref-2', 'ref-3']);
      expect(recordPhotoRefRepository.update).toHaveBeenCalledWith(
        { id: 'ref-2' },
        { status: RecordPhotoRefStatus.RECOMMENDED },
      );
      expect(recordPhotoRefRepository.update).toHaveBeenCalledWith(
        { id: 'ref-3' },
        { status: RecordPhotoRefStatus.RECOMMENDED },
      );
      expect(recordPhotoRefRepository.update).toHaveBeenCalledWith(
        { id: 'ref-1' },
        { status: RecordPhotoRefStatus.DISCARDED, tempFilePath: null },
      );
      await expect(fs.access(path1)).rejects.toThrow();
    });

    it('AI 호출이 실패하면 최신순으로 quota만큼 폴백 선택한다', async () => {
      const path1 = await writeTempFile('ref-1');
      const path2 = await writeTempFile('ref-2');

      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRefRepository.findBy!.mockResolvedValue([
        buildPhotoRef({
          id: 'ref-1',
          tempFilePath: path1,
          takenAt: new Date('2026-07-16T09:00:00Z'),
        }),
        buildPhotoRef({
          id: 'ref-2',
          tempFilePath: path2,
          takenAt: new Date('2026-07-16T10:00:00Z'),
        }),
      ]);
      photoCurateAiClient.selectBestPhotos.mockRejectedValue(new Error('openai down'));

      const result = await service.curate('trip-1', 'record-1', 'user-1');

      // 2장뿐이라 quota=2(전체 통과) — 최신순 폴백이면 둘 다 선택된다.
      expect([...result.recommended].sort()).toEqual(['ref-1', 'ref-2']);
    });

    it('촬영일이 서로 다른 사진도 날짜별로 나누지 않고 한 번에 AI를 호출한다', async () => {
      const path1 = await writeTempFile('ref-1');
      const path2 = await writeTempFile('ref-2');

      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRefRepository.findBy!.mockResolvedValue([
        buildPhotoRef({
          id: 'ref-1',
          tempFilePath: path1,
          takenAt: new Date('2026-07-16T09:00:00Z'),
        }),
        buildPhotoRef({
          id: 'ref-2',
          tempFilePath: path2,
          takenAt: new Date('2026-07-17T09:00:00Z'),
        }),
      ]);
      photoCurateAiClient.selectBestPhotos.mockResolvedValue({ selectedPhotoRefIds: [] });

      await service.curate('trip-1', 'record-1', 'user-1');

      expect(photoCurateAiClient.selectBestPhotos).toHaveBeenCalledTimes(1);
      expect(photoCurateAiClient.selectBestPhotos).toHaveBeenCalledWith(
        expect.objectContaining({
          selectCount: 2,
          candidates: expect.arrayContaining([
            expect.objectContaining({ photoRefId: 'ref-1' }),
            expect.objectContaining({ photoRefId: 'ref-2' }),
          ]),
        }),
      );
    });
  });
});
