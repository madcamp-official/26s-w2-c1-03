import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/** plan.md 산출물 목록의 storage/ 모듈 — Firebase Storage 영구 업로드 유틸리티. */
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
