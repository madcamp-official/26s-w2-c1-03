import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { BusinessException } from '../common/exceptions/business-exception';
import { CommonErrorCode } from '../common/exceptions/error-code';
import { loadPhotoBufferConfig } from '../config/photo-buffer.config';
import { TripsService } from '../trips/trips.service';
import { RegisterPhotoMetadataDto } from './dto/register-photo-metadata.dto';
import { RecordPhotoRef, RecordPhotoRefStatus } from './entities/record-photo-ref.entity';
import { TravelRecord, TravelRecordStatus } from './entities/travel-record.entity';
import { RecordsErrorCode } from './exceptions/records-error-code';

const MAX_UPLOAD_BATCH = 100;

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

@Injectable()
export class RecordsService {
  private readonly bufferDir: string;

  constructor(
    @InjectRepository(TravelRecord)
    private readonly travelRecordRepository: Repository<TravelRecord>,
    @InjectRepository(RecordPhotoRef)
    private readonly recordPhotoRefRepository: Repository<RecordPhotoRef>,
    private readonly tripsService: TripsService,
    configService: ConfigService,
  ) {
    this.bufferDir = loadPhotoBufferConfig(configService).dir;
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
