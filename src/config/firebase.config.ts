import { readFileSync } from 'fs';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';

/**
 * Firebase Admin SDK 앱 싱글턴(plan.md §11.2, storage/notifications 공용).
 * 서비스 계정 JSON은 저장소에 커밋하지 않고 FIREBASE_SERVICE_ACCOUNT_PATH 경로로
 * 주입한다(.env.example 참고). getApps()로 중복 초기화를 막는다 — 테스트나 핫리로드
 * 환경에서 이 함수가 여러 번 불릴 수 있다.
 */
export function getFirebaseApp(configService: ConfigService): App {
  const existing = getApps();
  if (existing.length > 0) {
    return existing[0];
  }

  const serviceAccountPath = configService.getOrThrow<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
  const storageBucket = configService.getOrThrow<string>('FIREBASE_STORAGE_BUCKET');
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

  return initializeApp({
    credential: cert(serviceAccount),
    storageBucket,
  });
}
