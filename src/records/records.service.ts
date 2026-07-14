import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../common/exceptions/business-exception';
import { TripsService } from '../trips/trips.service';
import { RegisterPhotoMetadataDto } from './dto/register-photo-metadata.dto';
import { RecordPhotoRef, RecordPhotoRefStatus } from './entities/record-photo-ref.entity';
import { TravelRecord, TravelRecordStatus } from './entities/travel-record.entity';
import { RecordsErrorCode } from './exceptions/records-error-code';

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
  constructor(
    @InjectRepository(TravelRecord)
    private readonly travelRecordRepository: Repository<TravelRecord>,
    @InjectRepository(RecordPhotoRef)
    private readonly recordPhotoRefRepository: Repository<RecordPhotoRef>,
    private readonly tripsService: TripsService,
  ) {}

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
