import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '../storage/storage.module';
import { TripsModule } from '../trips/trips.module';
import { OpenAiPhotoCurateClient, PHOTO_CURATE_AI_CLIENT } from './client/photo-curate-ai.client';
import { RecordPhotoRef } from './entities/record-photo-ref.entity';
import { TravelRecord } from './entities/travel-record.entity';
import { RecordPhoto } from './entities/record-photo.entity';
import { PhotoBufferCleanupService } from './photo-buffer-cleanup.service';
import { PhotoPreviewController } from './photo-preview.controller';
import { RecordsController } from './records.controller';
import { RecordsSummaryController } from './records-summary.controller';
import { RecordsService } from './records.service';
import { TripCoverController } from './trip-cover.controller';

/**
 * Phase 11: 기록 세션 시작 → 메타데이터 등록 → 업로드(로컬 임시 버퍼) + TTL 삭제
 * cron → curate(OpenAI 배치 선별) → candidates 미리보기 → finalize(Firebase
 * Storage 영구 저장)까지 사진 파이프라인 전 구간. TripsModule의 assertMember를
 * 재사용하고 StorageModule로 영구 업로드를 위임한다. 기록 관리(Phase 12)는
 * 이후 이어서 붙는다.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TravelRecord, RecordPhoto, RecordPhotoRef]),
    TripsModule,
    StorageModule,
  ],
  controllers: [
    RecordsController,
    PhotoPreviewController,
    RecordsSummaryController,
    TripCoverController,
  ],
  providers: [
    RecordsService,
    PhotoBufferCleanupService,
    { provide: PHOTO_CURATE_AI_CLIENT, useClass: OpenAiPhotoCurateClient },
  ],
  exports: [TypeOrmModule],
})
export class RecordsModule {}
