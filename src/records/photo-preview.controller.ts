import { Controller, Get, Logger, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream } from 'fs';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { RecordPhotoRef } from './entities/record-photo-ref.entity';
import { verifyPhotoPreviewToken } from './utils/photo-preview-token.util';

/**
 * 추천 사진 미리보기 실물 서빙(API 명세서 §4 GET .../photos/candidates의
 * previewUrl이 가리키는 곳). 이미지 로더가 Authorization 헤더 없이 직접 요청하는
 * 경로라 JwtAuthGuard 대신 짧은 TTL 서명(expires+sig)으로 photoRefId 단위 접근만
 * 허용한다 — RecordsController(JwtAuthGuard)와 분리된 별도 컨트롤러인 이유.
 */
@Controller('records/photo-preview')
export class PhotoPreviewController {
  private readonly logger = new Logger(PhotoPreviewController.name);
  private readonly secret: string;

  constructor(
    configService: ConfigService,
    @InjectRepository(RecordPhotoRef)
    private readonly recordPhotoRefRepository: Repository<RecordPhotoRef>,
  ) {
    this.secret = configService.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  @Get(':photoRefId')
  async serve(
    @Param('photoRefId') photoRefId: string,
    @Query('expires') expiresRaw: string,
    @Query('sig') signature: string,
    @Res() res: Response,
  ): Promise<void> {
    const expiresAt = Number(expiresRaw);
    if (!signature || !verifyPhotoPreviewToken(photoRefId, expiresAt, signature, this.secret)) {
      throw new NotFoundException();
    }

    const ref = await this.recordPhotoRefRepository.findOneBy({ id: photoRefId });
    if (!ref || !ref.tempFilePath) {
      throw new NotFoundException();
    }

    res.type('image/jpeg');
    createReadStream(ref.tempFilePath)
      .on('error', (err) => {
        this.logger.warn(`미리보기 파일 스트리밍 실패: ${err.message}`);
        if (!res.headersSent) {
          res.status(404).end();
        }
      })
      .pipe(res);
  }
}
