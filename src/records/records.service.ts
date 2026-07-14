import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { Repository } from 'typeorm';
import { BusinessException } from '../common/exceptions/business-exception';
import { CommonErrorCode } from '../common/exceptions/error-code';
import { loadPhotoBufferConfig } from '../config/photo-buffer.config';
import { StorageService } from '../storage/storage.service';
import { TripsService } from '../trips/trips.service';
import { PHOTO_CURATE_AI_CLIENT, PhotoCurateAiClient } from './client/photo-curate-ai.client';
import { FinalizePhotosDto } from './dto/finalize-photos.dto';
import { RegisterPhotoMetadataDto } from './dto/register-photo-metadata.dto';
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
   * 사용자 최종 선택 확정(API 명세서 §4). RECOMMENDED 상태의 photoRefId만 선택할
   * 수 있다 — 그 외(등록조차 안 됐거나 이미 폐기된 것)가 섞여 있으면 요청 자체를
   * 거부한다(업로드/메타데이터 단계의 "조용히 건너뛰기"와 다르게, finalize는
   * 사용자가 명시적으로 확정하는 마지막 단계라 잘못된 참조를 조용히 무시하지
   * 않는다). 선택된 사진만 영구 스토리지로 이관하고, 그 외 추천분은 전량 폐기한다.
   */
  async finalize(
    tripId: string,
    recordId: string,
    userId: string,
    dto: FinalizePhotosDto,
  ): Promise<{ recordPhotos: RecordPhotoSummary[] }> {
    const record = await this.findOwnedRecord(tripId, recordId, userId);

    const recommendedRefs = await this.recordPhotoRefRepository.findBy({
      recordId: record.id,
      status: RecordPhotoRefStatus.RECOMMENDED,
    });
    const refById = new Map(recommendedRefs.map((ref) => [ref.id, ref]));

    const selections = dto.selections.map((selection, index) => {
      const ref = refById.get(selection.photoRefId);
      if (!ref) {
        throw new BusinessException(
          CommonErrorCode.VALIDATION_ERROR,
          `추천되지 않았거나 이미 처리된 photoRefId입니다: ${selection.photoRefId}`,
        );
      }
      return {
        ref,
        caption: selection.caption ?? null,
        orderIndex: selection.orderIndex ?? index,
      };
    });

    const selectedIds = new Set(selections.map((s) => s.ref.id));
    const discarded = recommendedRefs.filter((ref) => !selectedIds.has(ref.id));

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
    const record = await this.travelRecordRepository.findOneBy({ id: recordId, tripId });
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
