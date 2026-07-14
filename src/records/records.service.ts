import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TripsService } from '../trips/trips.service';
import { TravelRecord, TravelRecordStatus } from './entities/travel-record.entity';

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

@Injectable()
export class RecordsService {
  constructor(
    @InjectRepository(TravelRecord)
    private readonly travelRecordRepository: Repository<TravelRecord>,
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
