import * as fsSync from 'fs';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RecordPhoto } from './entities/record-photo.entity';
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
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  };
}

/** listMyRecords()의 QueryBuilder 체인을 흉내낸다 — getMany()만 통제하면 된다. */
function createQueryBuilderMock(rows: TravelRecord[]) {
  return {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
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

function buildRecordPhoto(overrides: Partial<RecordPhoto> = {}): RecordPhoto {
  return {
    id: 'photo-1',
    recordId: 'record-1',
    record: undefined as never,
    storageUrl:
      'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/record-photos%2Frecord-1%2Fphoto-1.jpg?alt=media&token=abc',
    takenAt: new Date('2026-07-16T09:00:00Z'),
    locationName: '오사카',
    caption: null,
    orderIndex: 0,
    isCover: false,
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
  let recordPhotoRepository: RepoMock<RecordPhoto>;
  let tripsService: { assertMember: jest.Mock; setCoverImage: jest.Mock };
  let storageService: { uploadPermanent: jest.Mock; deletePermanent: jest.Mock };
  let configService: { getOrThrow: jest.Mock };
  let photoCurateAiClient: { selectBestPhotos: jest.Mock };
  let bufferDir: string;
  let service: RecordsService;

  beforeEach(async () => {
    travelRecordRepository = createRepositoryMock<TravelRecord>();
    recordPhotoRefRepository = createRepositoryMock<RecordPhotoRef>();
    recordPhotoRepository = createRepositoryMock<RecordPhoto>();
    recordPhotoRepository.delete = jest.fn();
    recordPhotoRepository.createQueryBuilder = jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    });
    tripsService = {
      assertMember: jest.fn().mockResolvedValue(undefined),
      setCoverImage: jest.fn().mockResolvedValue(undefined),
    };
    storageService = {
      uploadPermanent: jest.fn().mockResolvedValue('https://storage.example/photo.jpg'),
      deletePermanent: jest.fn().mockResolvedValue(undefined),
    };
    photoCurateAiClient = { selectBestPhotos: jest.fn() };

    bufferDir = await fs.mkdtemp(path.join(os.tmpdir(), 'record-photo-buffer-test-'));
    configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'PHOTO_TEMP_BUFFER_DIR') return bufferDir;
        if (key === 'JWT_ACCESS_SECRET') return 'test-secret-value-1234';
        return 30;
      }),
    };

    service = new RecordsService(
      travelRecordRepository as never,
      recordPhotoRefRepository as never,
      recordPhotoRepository as never,
      tripsService as never,
      storageService as never,
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

  describe('getCandidates', () => {
    it('RECOMMENDED 상태 사진만 서명된 미리보기 URL과 함께 반환한다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRefRepository.findBy!.mockResolvedValue([
        buildPhotoRef({
          id: 'ref-1',
          status: RecordPhotoRefStatus.RECOMMENDED,
          locationName: '오사카',
        }),
      ]);

      const result = await service.getCandidates('trip-1', 'record-1', 'user-1');

      expect(recordPhotoRefRepository.findBy).toHaveBeenCalledWith({
        recordId: 'record-1',
        status: RecordPhotoRefStatus.RECOMMENDED,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ photoRefId: 'ref-1', locationName: '오사카' });
      expect(result.items[0].previewUrl).toMatch(
        /^\/records\/photo-preview\/ref-1\?expires=\d+&sig=[0-9a-f]+$/,
      );
    });

    it('본인 기록이 아니면 RECORD_FORBIDDEN을 던진다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord({ userId: 'other-user' }));

      await expect(service.getCandidates('trip-1', 'record-1', 'user-1')).rejects.toMatchObject({
        code: 'RECORD_FORBIDDEN',
      });
    });
  });

  describe('finalize', () => {
    async function writeTempFile(photoRefId: string, content = 'jpeg-bytes'): Promise<string> {
      const filePath = path.join(bufferDir, photoRefId);
      await fs.writeFile(filePath, content);
      return filePath;
    }

    it('RECOMMENDED가 아닌(또는 존재하지 않는) photoRefId가 섞여 있으면 VALIDATION_ERROR를 던진다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRefRepository.findBy!.mockResolvedValue([]);

      await expect(
        service.finalize('trip-1', 'record-1', 'user-1', {
          selections: [{ photoRefId: 'ref-unknown' }],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(storageService.uploadPermanent).not.toHaveBeenCalled();
    });

    it('선택한 사진만 영구 스토리지에 업로드하고 record_photos로 저장한 뒤 임시본을 폐기한다', async () => {
      const path1 = await writeTempFile('ref-1');
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRefRepository.findBy!.mockResolvedValue([
        buildPhotoRef({
          id: 'ref-1',
          tempFilePath: path1,
          status: RecordPhotoRefStatus.RECOMMENDED,
        }),
      ]);

      const result = await service.finalize('trip-1', 'record-1', 'user-1', {
        selections: [{ photoRefId: 'ref-1', caption: '좋았다', orderIndex: 0 }],
      });

      expect(storageService.uploadPermanent).toHaveBeenCalledWith(
        Buffer.from('jpeg-bytes'),
        'record-photos/record-1/ref-1.jpg',
        'image/jpeg',
      );
      expect(result.recordPhotos).toHaveLength(1);
      expect(result.recordPhotos[0]).toMatchObject({
        storageUrl: 'https://storage.example/photo.jpg',
        caption: '좋았다',
        orderIndex: 0,
      });
      expect(recordPhotoRefRepository.update).toHaveBeenCalledWith(
        { id: 'ref-1' },
        { status: RecordPhotoRefStatus.DISCARDED, tempFilePath: null },
      );
      await expect(fs.access(path1)).rejects.toThrow();
    });

    it('선택되지 않은 추천분은 전량 폐기한다', async () => {
      const path1 = await writeTempFile('ref-1');
      const path2 = await writeTempFile('ref-2');
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRefRepository.findBy!.mockResolvedValue([
        buildPhotoRef({
          id: 'ref-1',
          tempFilePath: path1,
          status: RecordPhotoRefStatus.RECOMMENDED,
        }),
        buildPhotoRef({
          id: 'ref-2',
          tempFilePath: path2,
          status: RecordPhotoRefStatus.RECOMMENDED,
        }),
      ]);

      await service.finalize('trip-1', 'record-1', 'user-1', {
        selections: [{ photoRefId: 'ref-1' }],
      });

      expect(recordPhotoRefRepository.update).toHaveBeenCalledWith(
        { id: 'ref-2' },
        { status: RecordPhotoRefStatus.DISCARDED, tempFilePath: null },
      );
      await expect(fs.access(path2)).rejects.toThrow();
    });

    it('사용자 직접 선택 모드(curate 안 거친 UPLOADED 상태)도 finalize할 수 있다', async () => {
      const path1 = await writeTempFile('ref-1');
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRefRepository.findBy!.mockResolvedValue([
        buildPhotoRef({ id: 'ref-1', tempFilePath: path1, status: RecordPhotoRefStatus.UPLOADED }),
      ]);

      const result = await service.finalize('trip-1', 'record-1', 'user-1', {
        selections: [{ photoRefId: 'ref-1' }],
      });

      expect(result.recordPhotos).toHaveLength(1);
      expect(storageService.uploadPermanent).toHaveBeenCalledWith(
        Buffer.from('jpeg-bytes'),
        'record-photos/record-1/ref-1.jpg',
        'image/jpeg',
      );
    });
  });

  describe('updatePhoto', () => {
    it('사진이 이 기록 소속이 아니면 RECORD_PHOTO_NOT_FOUND를 던진다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRepository.findOneBy!.mockResolvedValue(null);

      await expect(
        service.updatePhoto('trip-1', 'record-1', 'user-1', 'photo-1', { caption: '좋다' }),
      ).rejects.toMatchObject({ code: 'RECORD_PHOTO_NOT_FOUND' });
    });

    it('caption/orderIndex만 바꾸면 대표사진 관련 로직은 건드리지 않는다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRepository.findOneBy!.mockResolvedValue(buildRecordPhoto());

      const result = await service.updatePhoto('trip-1', 'record-1', 'user-1', 'photo-1', {
        caption: '좋았다',
        orderIndex: 2,
      });

      expect(result).toMatchObject({ caption: '좋았다', orderIndex: 2 });
      expect(tripsService.setCoverImage).not.toHaveBeenCalled();
    });

    it('isCover를 true로 바꾸면 다른 대표사진을 해제하고 trips.cover_image_url을 갱신한다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      const photo = buildRecordPhoto({ isCover: false });
      recordPhotoRepository.findOneBy!.mockResolvedValue(photo);

      await service.updatePhoto('trip-1', 'record-1', 'user-1', 'photo-1', { isCover: true });

      const qb = recordPhotoRepository.createQueryBuilder!();
      expect(qb.set).toHaveBeenCalledWith({ isCover: false });
      expect(tripsService.setCoverImage).toHaveBeenCalledWith('trip-1', photo.storageUrl);
    });

    it('isCover를 false로 바꾸면(원래 대표사진이었을 때만) trips.cover_image_url을 해제한다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRepository.findOneBy!.mockResolvedValue(buildRecordPhoto({ isCover: true }));

      await service.updatePhoto('trip-1', 'record-1', 'user-1', 'photo-1', { isCover: false });

      expect(tripsService.setCoverImage).toHaveBeenCalledWith('trip-1', null);
    });

    it('원래 대표사진이 아니었으면 isCover:false를 보내도 아무 것도 갱신하지 않는다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRepository.findOneBy!.mockResolvedValue(buildRecordPhoto({ isCover: false }));

      await service.updatePhoto('trip-1', 'record-1', 'user-1', 'photo-1', { isCover: false });

      expect(tripsService.setCoverImage).not.toHaveBeenCalled();
    });
  });

  describe('deletePhoto', () => {
    it('사진이 없으면 RECORD_PHOTO_NOT_FOUND를 던지고 스토리지를 건드리지 않는다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRepository.findOneBy!.mockResolvedValue(null);

      await expect(
        service.deletePhoto('trip-1', 'record-1', 'user-1', 'photo-1'),
      ).rejects.toMatchObject({ code: 'RECORD_PHOTO_NOT_FOUND' });
      expect(storageService.deletePermanent).not.toHaveBeenCalled();
    });

    it('스토리지 파일과 DB 행을 함께 삭제한다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRepository.findOneBy!.mockResolvedValue(buildRecordPhoto());

      await service.deletePhoto('trip-1', 'record-1', 'user-1', 'photo-1');

      expect(storageService.deletePermanent).toHaveBeenCalledWith(
        'record-photos/record-1/photo-1.jpg',
      );
      expect(recordPhotoRepository.delete).toHaveBeenCalledWith({ id: 'photo-1' });
    });

    it('대표사진이었으면 trips.cover_image_url을 자동 해제한다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRepository.findOneBy!.mockResolvedValue(buildRecordPhoto({ isCover: true }));

      await service.deletePhoto('trip-1', 'record-1', 'user-1', 'photo-1');

      expect(tripsService.setCoverImage).toHaveBeenCalledWith('trip-1', null);
    });

    it('대표사진이 아니었으면 trips.cover_image_url을 건드리지 않는다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRepository.findOneBy!.mockResolvedValue(buildRecordPhoto({ isCover: false }));

      await service.deletePhoto('trip-1', 'record-1', 'user-1', 'photo-1');

      expect(tripsService.setCoverImage).not.toHaveBeenCalled();
    });
  });

  describe('updateRecord', () => {
    it('본인 기록이 아니면 RECORD_FORBIDDEN을 던진다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord({ userId: 'other-user' }));

      await expect(
        service.updateRecord('trip-1', 'record-1', 'user-1', { title: '제목' }),
      ).rejects.toMatchObject({ code: 'RECORD_FORBIDDEN' });
    });

    it('title/content/status를 부분 갱신한다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());

      const result = await service.updateRecord('trip-1', 'record-1', 'user-1', {
        title: '오사카 3박4일',
        content: '정말 좋았다',
        status: TravelRecordStatus.PUBLISHED,
      });

      expect(result).toMatchObject({
        title: '오사카 3박4일',
        content: '정말 좋았다',
        status: TravelRecordStatus.PUBLISHED,
      });
    });

    it('생략한 필드는 기존 값을 유지한다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(
        buildRecord({ title: '기존 제목', content: '기존 내용' }),
      );

      const result = await service.updateRecord('trip-1', 'record-1', 'user-1', {
        status: TravelRecordStatus.PUBLISHED,
      });

      expect(result).toMatchObject({ title: '기존 제목', content: '기존 내용' });
    });
  });

  describe('listMyRecords', () => {
    const trip = { cityName: '오사카', startDate: '2026-07-16', endDate: '2026-07-19' };

    it('본인 기록만, 대표사진은 isCover가 있으면 그것을 우선한다', async () => {
      const record = buildRecord({ id: 'record-1', trip: trip as never });
      travelRecordRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(createQueryBuilderMock([record]));
      recordPhotoRepository.find!.mockResolvedValue([
        buildRecordPhoto({ id: 'photo-1', recordId: 'record-1', orderIndex: 0, isCover: false }),
        buildRecordPhoto({
          id: 'photo-2',
          recordId: 'record-1',
          orderIndex: 1,
          isCover: true,
          storageUrl: 'https://storage.example/cover.jpg',
        }),
      ]);

      const result = await service.listMyRecords('user-1', {});

      expect(result.items).toEqual([
        expect.objectContaining({
          id: 'record-1',
          tripCityName: '오사카',
          tripStartDate: '2026-07-16',
          tripEndDate: '2026-07-19',
          coverPhotoUrl: 'https://storage.example/cover.jpg',
        }),
      ]);
      expect(result.nextCursor).toBeNull();
    });

    it('사진이 있지만 isCover가 하나도 없으면 orderIndex가 가장 앞선 사진을 쓴다', async () => {
      const record = buildRecord({ id: 'record-1', trip: trip as never });
      travelRecordRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(createQueryBuilderMock([record]));
      recordPhotoRepository.find!.mockResolvedValue([
        buildRecordPhoto({
          id: 'photo-1',
          recordId: 'record-1',
          orderIndex: 0,
          storageUrl: 'https://storage.example/first.jpg',
        }),
        buildRecordPhoto({
          id: 'photo-2',
          recordId: 'record-1',
          orderIndex: 1,
          storageUrl: 'https://storage.example/second.jpg',
        }),
      ]);

      const result = await service.listMyRecords('user-1', {});

      expect(result.items[0].coverPhotoUrl).toBe('https://storage.example/first.jpg');
    });

    it('사진이 하나도 없으면 coverPhotoUrl은 null이다', async () => {
      const record = buildRecord({ id: 'record-1', trip: trip as never });
      travelRecordRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(createQueryBuilderMock([record]));
      recordPhotoRepository.find!.mockResolvedValue([]);

      const result = await service.listMyRecords('user-1', {});

      expect(result.items[0].coverPhotoUrl).toBeNull();
    });

    it('limit보다 한 장 더 조회되면 hasMore로 판단해 nextCursor를 만든다', async () => {
      const records = [
        buildRecord({ id: 'record-1', trip: trip as never }),
        buildRecord({ id: 'record-2', trip: trip as never }),
      ];
      travelRecordRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(createQueryBuilderMock(records));
      recordPhotoRepository.find!.mockResolvedValue([]);

      const result = await service.listMyRecords('user-1', { limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('record-1');
      expect(result.nextCursor).not.toBeNull();
    });

    it('유효하지 않은 cursor는 VALIDATION_ERROR를 던진다', async () => {
      await expect(
        service.listMyRecords('user-1', { cursor: 'not-base64-json' }),
      ).rejects.toThrow();
    });
  });

  describe('getRecordDetail', () => {
    it('레코드가 없으면 RECORD_NOT_FOUND를 던진다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(null);

      await expect(service.getRecordDetail('record-1', 'user-1')).rejects.toMatchObject({
        code: 'RECORD_NOT_FOUND',
      });
    });

    it('본인 기록이 아니면 RECORD_FORBIDDEN을 던진다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord({ userId: 'other-user' }));

      await expect(service.getRecordDetail('record-1', 'user-1')).rejects.toMatchObject({
        code: 'RECORD_FORBIDDEN',
      });
    });

    it('사진을 orderIndex 순으로 포함해 반환한다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      const photos = [buildRecordPhoto({ id: 'photo-1', orderIndex: 0 })];
      recordPhotoRepository.find!.mockResolvedValue(photos);

      const result = await service.getRecordDetail('record-1', 'user-1');

      expect(result.photos).toHaveLength(1);
      expect(recordPhotoRepository.find).toHaveBeenCalledWith({
        where: { recordId: 'record-1' },
        order: { orderIndex: 'ASC' },
      });
    });
  });

  describe('deleteRecord', () => {
    it('본인 기록이 아니면 RECORD_FORBIDDEN을 던지고 아무것도 지우지 않는다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord({ userId: 'other-user' }));

      await expect(service.deleteRecord('record-1', 'user-1')).rejects.toMatchObject({
        code: 'RECORD_FORBIDDEN',
      });
      expect(storageService.deletePermanent).not.toHaveBeenCalled();
      expect(recordPhotoRepository.delete).not.toHaveBeenCalled();
    });

    it('사진 스토리지 파일까지 hard delete하고 기록은 soft delete한다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRepository.findBy!.mockResolvedValue([
        buildRecordPhoto({
          id: 'photo-1',
          storageUrl:
            'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/record-photos%2Frecord-1%2Fphoto-1.jpg?alt=media&token=abc',
        }),
      ]);

      await service.deleteRecord('record-1', 'user-1');

      expect(storageService.deletePermanent).toHaveBeenCalledWith(
        'record-photos/record-1/photo-1.jpg',
      );
      expect(recordPhotoRepository.delete).toHaveBeenCalledWith({ recordId: 'record-1' });
      expect(travelRecordRepository.update).toHaveBeenCalledWith(
        { id: 'record-1' },
        { deletedAt: expect.any(Date) },
      );
    });

    it('삭제된 사진 중 대표사진이 있었으면 트립 대표사진을 자동 해제한다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRepository.findBy!.mockResolvedValue([buildRecordPhoto({ isCover: true })]);

      await service.deleteRecord('record-1', 'user-1');

      expect(tripsService.setCoverImage).toHaveBeenCalledWith('trip-1', null);
    });

    it('삭제된 사진 중 대표사진이 없었으면 트립 대표사진을 건드리지 않는다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRepository.findBy!.mockResolvedValue([buildRecordPhoto({ isCover: false })]);

      await service.deleteRecord('record-1', 'user-1');

      expect(tripsService.setCoverImage).not.toHaveBeenCalled();
    });

    it('사진이 하나도 없으면 recordPhotoRepository.delete를 호출하지 않는다', async () => {
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());
      recordPhotoRepository.findBy!.mockResolvedValue([]);

      await service.deleteRecord('record-1', 'user-1');

      expect(recordPhotoRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('setTripCover', () => {
    it('트립 멤버가 아니면 assertMember가 던지는 예외를 그대로 전파한다', async () => {
      tripsService.assertMember.mockRejectedValue(new Error('forbidden'));

      await expect(service.setTripCover('trip-1', 'user-1', 'photo-1')).rejects.toThrow(
        'forbidden',
      );
      expect(recordPhotoRepository.findOneBy).not.toHaveBeenCalled();
    });

    it('recordPhotoId가 존재하지 않으면 RECORD_PHOTO_NOT_FOUND를 던진다', async () => {
      recordPhotoRepository.findOneBy!.mockResolvedValue(null);

      await expect(service.setTripCover('trip-1', 'user-1', 'photo-1')).rejects.toMatchObject({
        code: 'RECORD_PHOTO_NOT_FOUND',
      });
    });

    it('타 멤버가 작성한 기록의 사진이면 RECORD_FORBIDDEN을 던진다', async () => {
      recordPhotoRepository.findOneBy!.mockResolvedValue(
        buildRecordPhoto({ recordId: 'record-1' }),
      );
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord({ userId: 'other-user' }));

      await expect(service.setTripCover('trip-1', 'user-1', 'photo-1')).rejects.toMatchObject({
        code: 'RECORD_FORBIDDEN',
      });
      expect(tripsService.setCoverImage).not.toHaveBeenCalled();
    });

    it('본인 기록의 사진이면 다른 대표사진을 해제하고 trips.cover_image_url을 갱신한다', async () => {
      const photo = buildRecordPhoto({
        id: 'photo-1',
        recordId: 'record-1',
        storageUrl: 'https://storage.example/new-cover.jpg',
      });
      recordPhotoRepository.findOneBy!.mockResolvedValue(photo);
      travelRecordRepository.findOneBy!.mockResolvedValue(buildRecord());

      await service.setTripCover('trip-1', 'user-1', 'photo-1');

      expect(recordPhotoRepository.createQueryBuilder).toHaveBeenCalled();
      expect(recordPhotoRepository.update).toHaveBeenCalledWith(
        { id: 'photo-1' },
        { isCover: true },
      );
      expect(tripsService.setCoverImage).toHaveBeenCalledWith(
        'trip-1',
        'https://storage.example/new-cover.jpg',
      );
    });
  });

  describe('clearTripCover', () => {
    it('트립 멤버가 아니면 assertMember가 던지는 예외를 그대로 전파한다', async () => {
      tripsService.assertMember.mockRejectedValue(new Error('forbidden'));

      await expect(service.clearTripCover('trip-1', 'user-1')).rejects.toThrow('forbidden');
      expect(tripsService.setCoverImage).not.toHaveBeenCalled();
    });

    it('모든 대표사진 플래그를 해제하고 trips.cover_image_url을 null로 만든다', async () => {
      await service.clearTripCover('trip-1', 'user-1');

      expect(recordPhotoRepository.createQueryBuilder).toHaveBeenCalled();
      expect(tripsService.setCoverImage).toHaveBeenCalledWith('trip-1', null);
    });
  });
});
