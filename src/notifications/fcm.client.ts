import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { getFirebaseApp } from '../config/firebase.config';
import { PushMessage, PushSender, PushSendResult } from './push-sender';

/**
 * FCM이 "이 토큰은 더 이상 유효하지 않다"고 알리는 에러 코드들. 이런 토큰이 붙은
 * 디바이스는 앱이 삭제됐거나 토큰이 재발급된 것이므로 발송 대상에서 비활성화한다.
 */
const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Firebase Admin Messaging 기반 푸시 발송 구현(plan.md Phase 13). Storage와 동일한
 * Firebase Admin 앱 싱글턴(config/firebase.config)을 재사용한다.
 */
@Injectable()
export class FcmClient implements PushSender {
  private readonly logger = new Logger(FcmClient.name);
  private readonly messaging: Messaging;

  constructor(configService: ConfigService) {
    this.messaging = getMessaging(getFirebaseApp(configService));
  }

  async send(tokens: string[], message: PushMessage): Promise<PushSendResult> {
    if (tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    const response = await this.messaging.sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      data: message.data,
    });

    const invalidTokens: string[] = [];
    response.responses.forEach((res, index) => {
      if (!res.success && res.error && INVALID_TOKEN_ERROR_CODES.has(res.error.code)) {
        invalidTokens.push(tokens[index]);
      }
    });

    if (response.failureCount > 0) {
      this.logger.warn(
        `푸시 일부 실패 — 성공 ${response.successCount} / 실패 ${response.failureCount}, 무효 토큰 ${invalidTokens.length}건`,
      );
    }

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
    };
  }
}
