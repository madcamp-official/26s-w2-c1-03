import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { In, IsNull, Repository } from 'typeorm';
import { BusinessException } from '../common/exceptions/business-exception';
import { CommonErrorCode } from '../common/exceptions/error-code';
import { loadPhotoBufferConfig } from '../config/photo-buffer.config';
import { StorageService } from '../storage/storage.service';
import { TripsService } from '../trips/trips.service';
import { PHOTO_CURATE_AI_CLIENT, PhotoCurateAiClient } from './client/photo-curate-ai.client';
import { FinalizePhotosDto } from './dto/finalize-photos.dto';
import { ListRecordsQueryDto } from './dto/list-records-query.dto';
import { RegisterPhotoMetadataDto } from './dto/register-photo-metadata.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { UpdateRecordPhotoDto } from './dto/update-record-photo.dto';
import { RecordPhoto } from './entities/record-photo.entity';
import { RecordPhotoRef, RecordPhotoRefStatus } from './entities/record-photo-ref.entity';
import { TravelRecord, TravelRecordStatus } from './entities/travel-record.entity';
import { RecordsErrorCode } from './exceptions/records-error-code';
import { signPhotoPreviewToken } from './utils/photo-preview-token.util';

const MAX_UPLOAD_BATCH = 100;
const CURATE_TARGET_COUNT = 15;
const PREVIEW_TTL_MS = 5 * 60_000;

export interface RecordSummary {
  id: string;
  tripId: string;
  userId: string;
  title: string | null;
  content: string | null;
  status: TravelRecordStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PhotoRefSummary {
  photoRefId: string;
  localId: string;
}

export interface PhotoCandidateSummary {
  photoRefId: string;
  previewUrl: string;
  takenAt: Date | null;
  locationName: string | null;
}

export interface RecordPhotoSummary {
  id: string;
  recordId: string;
  storageUrl: string;
  takenAt: Date | null;
  locationName: string | null;
  caption: string | null;
  orderIndex: number;
  isCover: boolean;
  createdAt: Date;
}

/** API 명세서 §5 GET /records 목록 항목 — 여행 기간/cityName/이 기록의 대표사진. */
export interface RecordListItemSummary {
  id: string;
  tripId: string;
  title: string | null;
  status: TravelRecordStatus;
  tripCityName: string;
  tripStartDate: string;
  tripEndDate: string;
  coverPhotoUrl: string | null;
  createdAt: Date;
}

export interface PaginatedRecords {
  items: RecordListItemSummary[];
  nextCursor: string | null;
}

export interface RecordDetail extends RecordSummary {
  photos: RecordPhotoSummary[];
}

interface DecodedRecordCursor {
  createdAt: string;
  id: string;
}

const RECORDS_DEFAULT_LIMIT = 20;

@Injectable()
export class RecordsService {
  private readonly logger = new Logger(RecordsService.name);
  private readonly bufferDir: string;
  private readonly previewSecret: string;

  constructor(
    @InjectRepository(TravelRecord)
    private readonly travelRecordRepository: Repository<TravelRecord>,
    @InjectRepository(RecordPhotoRef)
    private readonly recordPhotoRefRepository: Repository<RecordPhotoRef>,
    @InjectRepository(RecordPhoto)
    private readonly recordPhotoRepository: Repository<RecordPhoto>,
    private readonly tripsService: TripsService,
    private readonly storageService: StorageService,
    configService: ConfigService,
    @Inject(PHOTO_CURATE_AI_CLIENT)
    private readonly photoCurateAiClient: PhotoCurateAiClient,
  ) {
    this.bufferDir = loadPhotoBufferConfig(configService).dir;
    // photo-preview 서명과 같은 secret을 재사용한다 — 별도 시크릿을 새로 요구하지
    // 않기 위한 실용적 선택(§4 "짧은 TTL 서명 URL"의 만료 검증만 하면 되는 용도).
    this.previewSecret = configService.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  /**
   * 기록 세션 시작(API 명세서 §4). `(trip_id, user_id)`가 unique라 기존 레코드가
   * 있으면(soft-delete 여부와 무관하게 — 인덱스가 deletedAt을 무시하는 전체
   * unique라 재생성이 애초에 불가능) 그대로 반환하고, 없을 때만 draft로 새로 만든다.
   */
  async startSession(tripId: string, userId: string): Promise<RecordSummary> {
    await this.tripsService.assertMember(tripId, userId);

    const existing = await this.travelRecordRepository.findOneBy({ tripId, userId });
    if (existing) {
      return this.toSummary(existing);
    }

    const created = await this.travelRecordRepository.save(
      this.travelRecordRepository.create({ tripId, userId, status: TravelRecordStatus.DRAFT }),
    );
    return this.toSummary(created);
  }

  /**
   * 온디바이스 1차 필터 통과 사진의 텍스트 메타데이터만 배치 등록(API 명세서 §4).
   * 최종 선택 전이라 record_photos에는 아직 기록하지 않고, 임시 참조(photoRefId)만
   * 발급한다. 같은 localId로 재호출되면(네트워크 재시도 등) 새로 만들지 않고
   * 메타데이터만 갱신한다 — (record_id, local_id) unique 제약과 일치하는 동작.
   */
  async registerMetadata(
    tripId: string,
    recordId: string,
    userId: string,
    dto: RegisterPhotoMetadataDto,
  ): Promise<{ photos: PhotoRefSummary[] }> {
    const record = await this.findOwnedRecord(tripId, recordId, userId);

    const photos: PhotoRefSummary[] = [];
    for (const item of dto.photos) {
      const existing = await this.recordPhotoRefRepository.findOneBy({
        recordId: record.id,
        localId: item.localId,
      });

      const takenAt = new Date(item.takenAt);
      const locationName = item.locationName ?? null;

      const saved = existing
        ? await this.recordPhotoRefRepository.save({ ...existing, takenAt, locationName })
        : await this.recordPhotoRefRepository.save(
            this.recordPhotoRefRepository.create({
              recordId: record.id,
              localId: item.localId,
              takenAt,
              locationName,
              status: RecordPhotoRefStatus.PENDING,
            }),
          );

      photos.push({ photoRefId: saved.id, localId: saved.localId });
    }

    return { photos };
  }

  /**
   * 1차 필터 통과 사진 실물 업로드(API 명세서 §4). multipart 파일의 fieldname을
   * photoRefId로 매칭한다 — 등록되지 않았거나(metadata 단계를 안 거침) 이미
   * PENDING을 지난 photoRefId는 조용히 건너뛴다(클라이언트 재시도로 일부만 다시
   * 보내는 상황을 에러로 취급하지 않음). 로컬 임시 디스크에만 쓰고 DB에는 경로
   * 문자열만 남긴다 — 사진 바이트 자체는 디스크/DB 어디에도 영구 기록하지 않는다(§8.3).
   */
  async uploadPhotos(
    tripId: string,
    recordId: string,
    userId: string,
    files: Express.Multer.File[],
  ): Promise<{ uploaded: string[] }> {
    if (files.length > MAX_UPLOAD_BATCH) {
      throw new BusinessException(
        CommonErrorCode.VALIDATION_ERROR,
        `한 번에 최대 ${MAX_UPLOAD_BATCH}장까지 업로드할 수 있습니다.`,
      );
    }

    const record = await this.findOwnedRecord(tripId, recordId, userId);
    if (files.length === 0) {
      return { uploaded: [] };
    }

    const refs = await this.recordPhotoRefRepository.findBy({ recordId: record.id });
    const refById = new Map(refs.map((ref) => [ref.id, ref]));

    await fs.mkdir(this.bufferDir, { recursive: true });

    const uploaded: string[] = [];
    for (const file of files) {
      const photoRefId = file.fieldname;
      const ref = refById.get(photoRefId);
      if (!ref || ref.status !== RecordPhotoRefStatus.PENDING) {
        continue;
      }

      const filePath = path.join(this.bufferDir, photoRefId);
      await fs.writeFile(filePath, file.buffer);

      await this.recordPhotoRefRepository.update(
        { id: ref.id },
        { tempFilePath: filePath, status: RecordPhotoRefStatus.UPLOADED },
      );
      uploaded.push(photoRefId);
    }

    return { uploaded };
  }

  /**
   * UPLOADED 상태 사진 전체(여행 전체 기간)를 한 번에 OpenAI에 보내 베스트
   * 최대 15장을 추천한다(API 명세서 §4 — 날짜별이 아니라 여행 전체 기준 선별로
   * 변경). 추천분은 RECOMMENDED로, 비추천분은 즉시 임시 버퍼에서 폐기(DISCARDED
   * + 파일 삭제)한다. 이미 처리된 photoRef는 다시 curate되지 않는다.
   */
  async curate(
    tripId: string,
    recordId: string,
    userId: string,
  ): Promise<{ recommended: string[] }> {
    const record = await this.findOwnedRecord(tripId, recordId, userId);

    const uploadedRefs = await this.recordPhotoRefRepository.findBy({
      recordId: record.id,
      status: RecordPhotoRefStatus.UPLOADED,
    });
    if (uploadedRefs.length === 0) {
      return { recommended: [] };
    }

    const quota = Math.min(CURATE_TARGET_COUNT, uploadedRefs.length);
    const recommended = await this.selectBestOverall(uploadedRefs, quota);

    const recommendedSet = new Set(recommended);
    const discarded = uploadedRefs.filter((ref) => !recommendedSet.has(ref.id));

    await Promise.all([
      ...recommended.map((id) =>
        this.recordPhotoRefRepository.update({ id }, { status: RecordPhotoRefStatus.RECOMMENDED }),
      ),
      ...discarded.map((ref) => this.discardRef(ref)),
    ]);

    return { recommended };
  }

  /**
   * 추천된 사진의 짧은 TTL 서명 URL 미리보기(API 명세서 §4). 사진 실물은 여전히
   * 임시 버퍼에만 있으므로 PhotoPreviewController가 이 서명을 검증해 스트리밍한다.
   */
  async getCandidates(
    tripId: string,
    recordId: string,
    userId: string,
  ): Promise<{ items: PhotoCandidateSummary[] }> {
    const record = await this.findOwnedRecord(tripId, recordId, userId);

    const refs = await this.recordPhotoRefRepository.findBy({
      recordId: record.id,
      status: RecordPhotoRefStatus.RECOMMENDED,
    });

    return {
      items: refs.map((ref) => ({
        photoRefId: ref.id,
        previewUrl: this.buildPreviewUrl(ref.id),
        takenAt: ref.takenAt,
        locationName: ref.locationName,
      })),
    };
  }

  /**
   * 사용자 최종 선택 확정(API 명세서 §4). RECOMMENDED(AI 추천 경로) 또는
   * UPLOADED(사용자 직접 선택 경로 — curate를 안 거치고 업로드분을 그대로 씀)
   * 상태의 photoRefId만 선택할 수 있다 — 그 외(등록조차 안 됐거나 이미 폐기된
   * 것)가 섞여 있으면 요청 자체를 거부한다(업로드/메타데이터 단계의 "조용히
   * 건너뛰기"와 다르게, finalize는 사용자가 명시적으로 확정하는 마지막
   * 단계라 잘못된 참조를 조용히 무시하지 않는다). 선택된 사진만 영구
   * 스토리지로 이관하고, 그 외(추천됐지만 미선택 또는 직접 선택 모드에서
   * 업로드했지만 최종 미선택)는 전량 폐기한다.
   */
  async finalize(
    tripId: string,
    recordId: string,
    userId: string,
    dto: FinalizePhotosDto,
  ): Promise<{ recordPhotos: RecordPhotoSummary[] }> {
    const record = await this.findOwnedRecord(tripId, recordId, userId);

    const selectableRefs = await this.recordPhotoRefRepository.findBy({
      recordId: record.id,
      status: In([RecordPhotoRefStatus.RECOMMENDED, RecordPhotoRefStatus.UPLOADED]),
    });
    const refById = new Map(selectableRefs.map((ref) => [ref.id, ref]));

    const selections = dto.selections.map((selection, index) => {
      const ref = refById.get(selection.photoRefId);
      if (!ref) {
        throw new BusinessException(
          CommonErrorCode.VALIDATION_ERROR,
          `추천/업로드되지 않았거나 이미 처리된 photoRefId입니다: ${selection.photoRefId}`,
        );
      }
      return {
        ref,
        caption: selection.caption ?? null,
        orderIndex: selection.orderIndex ?? index,
      };
    });

    const selectedIds = new Set(selections.map((s) => s.ref.id));
    const discarded = selectableRefs.filter((ref) => !selectedIds.has(ref.id));

    const recordPhotos = await Promise.all(
      selections.map(({ ref, caption, orderIndex }) =>
        this.finalizeOne(record.id, ref, caption, orderIndex),
      ),
    );
    await Promise.all(discarded.map((ref) => this.discardRef(ref)));

    return { recordPhotos };
  }

  private async finalizeOne(
    recordId: string,
    ref: RecordPhotoRef,
    caption: string | null,
    orderIndex: number,
  ): Promise<RecordPhotoSummary> {
    const buffer = await fs.readFile(ref.tempFilePath!);
    const objectPath = `record-photos/${recordId}/${ref.id}.jpg`;
    const storageUrl = await this.storageService.uploadPermanent(buffer, objectPath, 'image/jpeg');

    const saved = await this.recordPhotoRepository.save(
      this.recordPhotoRepository.create({
        recordId,
        storageUrl,
        takenAt: ref.takenAt,
        locationName: ref.locationName,
        caption,
        orderIndex,
        isCover: false,
      }),
    );

    // 영구 스토리지 이관이 끝났으니 임시본은 폐기한다(§8.3 "미선택 사진은 임시
    // 버퍼 단계에서 폐기" — 선택분도 이관 후에는 임시 사본을 남겨둘 이유가 없다).
    await this.discardRef(ref);

    return this.toPhotoSummary(saved);
  }

  /**
   * 캡션/순서/대표사진 수정(API 명세서 §4). isCover를 true로 바꾸면 같은 트립의
   * 다른 대표사진을 해제하고 trips.cover_image_url을 이 사진으로 갱신하며,
   * false로 바꾸면(그리고 실제로 대표사진이었다면) trips.cover_image_url을
   * 해제한다(§2.6). Phase 12의 전용 대표사진 엔드포인트와 별개로, 이 필드 자체가
   * 명세서 §4 요청 스키마에 포함돼 있어 여기서도 반영한다.
   */
  async updatePhoto(
    tripId: string,
    recordId: string,
    userId: string,
    recordPhotoId: string,
    dto: UpdateRecordPhotoDto,
  ): Promise<RecordPhotoSummary> {
    const record = await this.findOwnedRecord(tripId, recordId, userId);
    const photo = await this.findOwnedPhoto(record.id, recordPhotoId);
    const wasCover = photo.isCover;

    if (dto.caption !== undefined) {
      photo.caption = dto.caption;
    }
    if (dto.orderIndex !== undefined) {
      photo.orderIndex = dto.orderIndex;
    }
    if (dto.isCover !== undefined) {
      photo.isCover = dto.isCover;
    }

    const saved = await this.recordPhotoRepository.save(photo);

    if (dto.isCover === true && !wasCover) {
      await this.clearOtherCoverPhotos(tripId, photo.id);
      await this.tripsService.setCoverImage(tripId, photo.storageUrl);
    } else if (dto.isCover === false && wasCover) {
      await this.tripsService.setCoverImage(tripId, null);
    }

    return this.toPhotoSummary(saved);
  }

  /**
   * 개별 사진 삭제(API 명세서 §4) — 스토리지 파일도 함께 삭제하고, 대표사진이었으면
   * trips.cover_image_url을 자동 해제한다(§2.6).
   */
  async deletePhoto(
    tripId: string,
    recordId: string,
    userId: string,
    recordPhotoId: string,
  ): Promise<void> {
    const record = await this.findOwnedRecord(tripId, recordId, userId);
    const photo = await this.findOwnedPhoto(record.id, recordPhotoId);

    const objectPath = StorageService.extractObjectPath(photo.storageUrl);
    if (objectPath) {
      await this.storageService.deletePermanent(objectPath);
    }
    await this.recordPhotoRepository.delete({ id: photo.id });

    if (photo.isCover) {
      await this.tripsService.setCoverImage(tripId, null);
    }
  }

  /** 일기 본문 작성/수정, draft→published 전환(API 명세서 §4). */
  async updateRecord(
    tripId: string,
    recordId: string,
    userId: string,
    dto: UpdateRecordDto,
  ): Promise<RecordSummary> {
    const record = await this.findOwnedRecord(tripId, recordId, userId);

    if (dto.title !== undefined) {
      record.title = dto.title;
    }
    if (dto.content !== undefined) {
      record.content = dto.content;
    }
    if (dto.status !== undefined) {
      record.status = dto.status;
    }

    const saved = await this.travelRecordRepository.save(record);
    return this.toSummary(saved);
  }

  /**
   * 내 모든 여행 기록 목록(API 명세서 §5 GET /records) — 본인이 작성한 기록만,
   * soft delete된 것은 제외. TripsService.list와 동일한 cursor 페이지네이션 패턴.
   */
  async listMyRecords(userId: string, query: ListRecordsQueryDto): Promise<PaginatedRecords> {
    const limit = query.limit ?? RECORDS_DEFAULT_LIMIT;
    const cursor = this.decodeRecordCursor(query.cursor);

    const qb = this.travelRecordRepository
      .createQueryBuilder('record')
      .innerJoinAndSelect('record.trip', 'trip')
      .where('record.userId = :userId', { userId })
      .andWhere('record.deletedAt IS NULL')
      .orderBy('record.createdAt', 'DESC')
      .addOrderBy('record.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      qb.andWhere('(record.createdAt, record.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const coverByRecordId = await this.loadRepresentativePhotoUrls(page.map((r) => r.id));

    return {
      items: page.map((record) =>
        this.toListItemSummary(record, coverByRecordId.get(record.id) ?? null),
      ),
      nextCursor: hasMore ? this.encodeRecordCursor(page[page.length - 1]) : null,
    };
  }

  /** 기록 상세(API 명세서 §5 GET /records/{recordId}) — 사진 목록 포함, 작성자 본인만. */
  async getRecordDetail(recordId: string, userId: string): Promise<RecordDetail> {
    const record = await this.findOwnedRecordById(recordId, userId);
    const photos = await this.recordPhotoRepository.find({
      where: { recordId: record.id },
      order: { orderIndex: 'ASC' },
    });
    return { ...this.toSummary(record), photos: photos.map((photo) => this.toPhotoSummary(photo)) };
  }

  /**
   * 기록 삭제(API 명세서 §5 DELETE /records/{recordId}) — travel_records는
   * soft delete, 연결된 record_photos는 스토리지 파일까지 hard delete. 삭제된
   * 사진 중 트립 대표사진이 있었으면 자동 해제(§2.6).
   */
  async deleteRecord(recordId: string, userId: string): Promise<void> {
    const record = await this.findOwnedRecordById(recordId, userId);
    const photos = await this.recordPhotoRepository.findBy({ recordId: record.id });

    await Promise.all(
      photos.map(async (photo) => {
        const objectPath = StorageService.extractObjectPath(photo.storageUrl);
        if (objectPath) {
          await this.storageService.deletePermanent(objectPath);
        }
      }),
    );
    if (photos.length > 0) {
      await this.recordPhotoRepository.delete({ recordId: record.id });
    }

    await this.travelRecordRepository.update({ id: record.id }, { deletedAt: new Date() });

    if (photos.some((photo) => photo.isCover)) {
      await this.tripsService.setCoverImage(record.tripId, null);
    }
  }

  /**
   * 여행 대표사진 지정(API 명세서 §2.6 PUT /trips/{tripId}/cover). recordPhotoId는
   * 요청자 본인이 작성한 기록의 사진이어야 한다(타 멤버 사진이면 403). record_photos
   * 쪽 isCover 플래그도 함께 갱신해 PATCH .../photos/{id}가 설정한 것과 상태가
   * 어긋나지 않게 한다.
   */
  async setTripCover(tripId: string, userId: string, recordPhotoId: string): Promise<void> {
    await this.tripsService.assertMember(tripId, userId);

    const photo = await this.recordPhotoRepository.findOneBy({ id: recordPhotoId });
    if (!photo) {
      throw new BusinessException(RecordsErrorCode.RECORD_PHOTO_NOT_FOUND);
    }
    const record = await this.travelRecordRepository.findOneBy({ id: photo.recordId, tripId });
    if (!record || record.userId !== userId) {
      throw new BusinessException(RecordsErrorCode.RECORD_FORBIDDEN);
    }

    await this.clearOtherCoverPhotos(tripId, photo.id);
    await this.recordPhotoRepository.update({ id: photo.id }, { isCover: true });
    await this.tripsService.setCoverImage(tripId, photo.storageUrl);
  }

  /** 여행 대표사진 해제(API 명세서 §2.6 DELETE /trips/{tripId}/cover). */
  async clearTripCover(tripId: string, userId: string): Promise<void> {
    await this.tripsService.assertMember(tripId, userId);
    await this.clearOtherCoverPhotos(tripId, null);
    await this.tripsService.setCoverImage(tripId, null);
  }

  private async findOwnedPhoto(recordId: string, recordPhotoId: string): Promise<RecordPhoto> {
    const photo = await this.recordPhotoRepository.findOneBy({ id: recordPhotoId, recordId });
    if (!photo) {
      throw new BusinessException(RecordsErrorCode.RECORD_PHOTO_NOT_FOUND);
    }
    return photo;
  }

  /** record.user_id == 요청자 검증(API 명세서 §5 비공개 원칙), tripId 없이 recordId만으로 조회. */
  private async findOwnedRecordById(recordId: string, userId: string): Promise<TravelRecord> {
    const record = await this.travelRecordRepository.findOneBy({
      id: recordId,
      deletedAt: IsNull(),
    });
    if (!record) {
      throw new BusinessException(RecordsErrorCode.RECORD_NOT_FOUND);
    }
    if (record.userId !== userId) {
      throw new BusinessException(RecordsErrorCode.RECORD_FORBIDDEN);
    }
    return record;
  }

  /**
   * 기록 목록의 "대표사진"(개별 기록 단위 — 트립 대표사진과는 다른 개념) — 이
   * 기록의 사진 중 isCover가 있으면 그것, 없으면 orderIndex가 가장 앞선 사진.
   */
  private async loadRepresentativePhotoUrls(recordIds: string[]): Promise<Map<string, string>> {
    if (recordIds.length === 0) {
      return new Map();
    }
    const photos = await this.recordPhotoRepository.find({
      where: { recordId: In(recordIds) },
      order: { orderIndex: 'ASC' },
    });

    const map = new Map<string, string>();
    for (const photo of photos) {
      if (photo.isCover || !map.has(photo.recordId)) {
        map.set(photo.recordId, photo.storageUrl);
      }
    }
    return map;
  }

  private toListItemSummary(
    record: TravelRecord,
    coverPhotoUrl: string | null,
  ): RecordListItemSummary {
    return {
      id: record.id,
      tripId: record.tripId,
      title: record.title,
      status: record.status,
      tripCityName: record.trip.cityName,
      tripStartDate: record.trip.startDate,
      tripEndDate: record.trip.endDate,
      coverPhotoUrl,
      createdAt: record.createdAt,
    };
  }

  private encodeRecordCursor(record: TravelRecord): string {
    const payload: DecodedRecordCursor = {
      createdAt: record.createdAt.toISOString(),
      id: record.id,
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  private decodeRecordCursor(cursor?: string): DecodedRecordCursor | null {
    if (!cursor) {
      return null;
    }
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
      if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
        throw new Error('invalid cursor shape');
      }
      return parsed as DecodedRecordCursor;
    } catch {
      throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, '유효하지 않은 cursor입니다.');
    }
  }

  /** 같은 트립 안의 record_photos 중 isCover=true였던 것들을 전부 해제한다.
   *  [excludePhotoId]를 주면 그 사진만 제외하고 해제(재지정 시), null이면 전부 해제(해제 시). */
  private async clearOtherCoverPhotos(
    tripId: string,
    excludePhotoId: string | null,
  ): Promise<void> {
    const qb = this.recordPhotoRepository
      .createQueryBuilder()
      .update(RecordPhoto)
      .set({ isCover: false })
      .where('is_cover = true')
      .andWhere('record_id IN (SELECT id FROM travel_records WHERE trip_id = :tripId)', { tripId });

    if (excludePhotoId) {
      qb.andWhere('id != :excludePhotoId', { excludePhotoId });
    }

    await qb.execute();
  }

  private buildPreviewUrl(photoRefId: string): string {
    const expiresAt = Date.now() + PREVIEW_TTL_MS;
    const signature = signPhotoPreviewToken(photoRefId, expiresAt, this.previewSecret);
    return `/records/photo-preview/${photoRefId}?expires=${expiresAt}&sig=${signature}`;
  }

  private toPhotoSummary(photo: RecordPhoto): RecordPhotoSummary {
    return {
      id: photo.id,
      recordId: photo.recordId,
      storageUrl: photo.storageUrl,
      takenAt: photo.takenAt,
      locationName: photo.locationName,
      caption: photo.caption,
      orderIndex: photo.orderIndex,
      isCover: photo.isCover,
      createdAt: photo.createdAt,
    };
  }

  /**
   * OpenAI가 실패하면 전체를 실패시키지 않고 최신순으로 quota만큼 폴백 선택한다
   * (§16 리스크 대응 기조 — 필터링 실패가 전체 파이프라인을 막지 않게).
   */
  private async selectBestOverall(refs: RecordPhotoRef[], quota: number): Promise<string[]> {
    try {
      const candidates = await Promise.all(
        refs
          .filter((ref) => ref.tempFilePath)
          .map(async (ref) => ({
            photoRefId: ref.id,
            takenAt: ref.takenAt,
            imageBuffer: await this.stripExif(await fs.readFile(ref.tempFilePath!)),
          })),
      );
      const result = await this.photoCurateAiClient.selectBestPhotos({
        candidates,
        selectCount: quota,
      });
      return result.selectedPhotoRefIds;
    } catch (error) {
      this.logger.warn(`사진 선별 AI 실패, 최신순 폴백으로 대체: ${(error as Error).message}`);
      return [...refs]
        .sort((a, b) => (b.takenAt?.getTime() ?? 0) - (a.takenAt?.getTime() ?? 0))
        .slice(0, quota)
        .map((ref) => ref.id);
    }
  }

  /** OpenAI 전송 직전 재인코딩으로 EXIF를 다시 한번 제거한다(§9.3 이중 스트립). */
  private async stripExif(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer).jpeg().toBuffer();
  }

  private async discardRef(ref: RecordPhotoRef): Promise<void> {
    if (ref.tempFilePath) {
      await fs.unlink(ref.tempFilePath).catch(() => undefined);
    }
    await this.recordPhotoRefRepository.update(
      { id: ref.id },
      { status: RecordPhotoRefStatus.DISCARDED, tempFilePath: null },
    );
  }

  /** record.user_id == 요청자 검증(API 명세서 §4 비공개 원칙), 아니면 403. */
  private async findOwnedRecord(
    tripId: string,
    recordId: string,
    userId: string,
  ): Promise<TravelRecord> {
    const record = await this.travelRecordRepository.findOneBy({
      id: recordId,
      tripId,
      deletedAt: IsNull(),
    });
    if (!record) {
      throw new BusinessException(RecordsErrorCode.RECORD_NOT_FOUND);
    }
    if (record.userId !== userId) {
      throw new BusinessException(RecordsErrorCode.RECORD_FORBIDDEN);
    }
    return record;
  }

  private toSummary(record: TravelRecord): RecordSummary {
    return {
      id: record.id,
      tripId: record.tripId,
      userId: record.userId,
      title: record.title,
      content: record.content,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
