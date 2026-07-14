import { ConfigService } from '@nestjs/config';

/**
 * 사진 파이프라인의 로컬 임시 버퍼(pass-through) 설정(plan.md Phase 11, §8.3).
 * OpenAiConfig(openai.config.ts)와 같은 패턴 — 여러 provider(RecordsService,
 * PhotoBufferCleanupService)가 같은 값을 공유한다.
 */
export interface PhotoBufferConfig {
  dir: string;
  ttlMinutes: number;
}

export function loadPhotoBufferConfig(configService: ConfigService): PhotoBufferConfig {
  return {
    dir: configService.getOrThrow<string>('PHOTO_TEMP_BUFFER_DIR'),
    ttlMinutes: configService.getOrThrow<number>('PHOTO_TEMP_BUFFER_TTL_MINUTES'),
  };
}
