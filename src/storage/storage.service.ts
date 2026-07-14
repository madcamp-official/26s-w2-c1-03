import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { getStorage } from 'firebase-admin/storage';
import { getFirebaseApp } from '../config/firebase.config';

/**
 * 최종 선택된 사진 실물의 영구 저장(plan.md §11.2, API 명세서 §8.3 "선택된 사진만
 * 암호화된 스토리지에 업로드"). 저장 시 암호화는 GCS 기본 제공(Google-managed
 * key)이라 별도 처리가 필요 없다.
 */
@Injectable()
export class StorageService {
  private readonly bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>;

  constructor(configService: ConfigService) {
    const app = getFirebaseApp(configService);
    this.bucket = getStorage(app).bucket();
  }

  /**
   * [buffer]를 [objectPath]에 업로드하고, Firebase 클라이언트 SDK와 동일한 형식의
   * 다운로드 URL을 반환한다. Admin SDK로 올린 객체는 클라이언트 SDK 업로드와 달리
   * 다운로드 토큰이 자동으로 붙지 않으므로 직접 발급해 메타데이터에 심는다.
   */
  async uploadPermanent(buffer: Buffer, objectPath: string, contentType: string): Promise<string> {
    const downloadToken = randomUUID();
    await this.bucket.file(objectPath).save(buffer, {
      contentType,
      metadata: { metadata: { firebaseStorageDownloadTokens: downloadToken } },
    });

    const encodedPath = encodeURIComponent(objectPath);
    return `https://firebasestorage.googleapis.com/v0/b/${this.bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
  }
}
