import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripsModule } from '../trips/trips.module';
import { OpenAiPhotoCurateClient, PHOTO_CURATE_AI_CLIENT } from './client/photo-curate-ai.client';
import { RecordPhotoRef } from './entities/record-photo-ref.entity';
import { TravelRecord } from './entities/travel-record.entity';
import { RecordPhoto } from './entities/record-photo.entity';
import { PhotoBufferCleanupService } from './photo-buffer-cleanup.service';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';

/**
 * Phase 11: 기록 세션 시작, 사진 메타데이터 등록, 실물 업로드(로컬 임시 버퍼
 * pass-through) + TTL 강제 삭제 cron + curate(OpenAI 배치 선별)까지 추가,
 * TripsModule의 assertMember를 재사용한다. finalize와 기록 관리(Phase 12)는
 * 이후 이어서 붙는다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TravelRecord, RecordPhoto, RecordPhotoRef]), TripsModule],
  controllers: [RecordsController],
  providers: [
    RecordsService,
    PhotoBufferCleanupService,
    { provide: PHOTO_CURATE_AI_CLIENT, useClass: OpenAiPhotoCurateClient },
  ],
  exports: [TypeOrmModule],
})
export class RecordsModule {}
