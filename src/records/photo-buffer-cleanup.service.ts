import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { loadPhotoBufferConfig } from '../config/photo-buffer.config';
import { RecordPhotoRef, RecordPhotoRefStatus } from './entities/record-photo-ref.entity';

/**
 * TTL 강제 삭제(plan.md Phase 11 BE 체크리스트) — curate/finalize의 명시적 폐기와
 * 별개의 이중 안전장치(§6). 세션이 중간에 끊겨 명시적 폐기가 못 도는 경우를
 * 대비해, TTL을 넘긴 임시 버퍼 파일을 주기적으로 강제 삭제한다.
 */
@Injectable()
export class PhotoBufferCleanupService {
  private readonly logger = new Logger(PhotoBufferCleanupService.name);
  private readonly bufferDir: string;
  private readonly ttlMs: number;

  constructor(
    configService: ConfigService,
    @InjectRepository(RecordPhotoRef)
    private readonly recordPhotoRefRepository: Repository<RecordPhotoRef>,
  ) {
    const config = loadPhotoBufferConfig(configService);
    this.bufferDir = config.dir;
    this.ttlMs = config.ttlMinutes * 60_000;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweepExpiredFiles(): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.bufferDir);
    } catch {
      // 버퍼 디렉터리가 아직 없으면(업로드 이력 없음) 할 일이 없다.
      return;
    }

    const now = Date.now();
    for (const entry of entries) {
      const filePath = path.join(this.bufferDir, entry);
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat || now - stat.mtimeMs < this.ttlMs) {
        continue;
      }

      await fs
        .unlink(filePath)
        .catch((err) => this.logger.warn(`임시 버퍼 파일 삭제 실패: ${filePath} (${err})`));

      await this.recordPhotoRefRepository.update(
        { tempFilePath: filePath },
        { tempFilePath: null, status: RecordPhotoRefStatus.DISCARDED },
      );
    }
  }
}
