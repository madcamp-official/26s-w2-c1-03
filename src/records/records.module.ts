import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripsModule } from '../trips/trips.module';
import { RecordPhotoRef } from './entities/record-photo-ref.entity';
import { TravelRecord } from './entities/travel-record.entity';
import { RecordPhoto } from './entities/record-photo.entity';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';

/**
 * Phase 11: 기록 세션 시작(POST /trips/:tripId/records)과 사진 메타데이터 등록
 * (POST .../photos/metadata) 추가, TripsModule의 assertMember를 재사용한다.
 * 업로드/curate/finalize와 기록 관리(Phase 12)는 이후 이어서 붙는다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TravelRecord, RecordPhoto, RecordPhotoRef]), TripsModule],
  controllers: [RecordsController],
  providers: [RecordsService],
  exports: [TypeOrmModule],
})
export class RecordsModule {}
