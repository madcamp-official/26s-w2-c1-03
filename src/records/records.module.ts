import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripsModule } from '../trips/trips.module';
import { TravelRecord } from './entities/travel-record.entity';
import { RecordPhoto } from './entities/record-photo.entity';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';

/**
 * Phase 11: 기록 세션 시작(POST /trips/:tripId/records) 추가, TripsModule의
 * assertMember를 재사용한다. 사진 파이프라인(metadata/upload/curate/finalize)과
 * 기록 관리(Phase 12)는 이후 이어서 붙는다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TravelRecord, RecordPhoto]), TripsModule],
  controllers: [RecordsController],
  providers: [RecordsService],
  exports: [TypeOrmModule],
})
export class RecordsModule {}
