/**
 * 푸시 발송 추상화(plan.md §9.1 "인터페이스로 추상화해 제공자 교체 가능"과 동일 취지).
 * 구현체(FcmClient)는 Firebase Admin Messaging을 쓰지만, NotificationsService는 이
 * 인터페이스에만 의존해 테스트에서 Mock으로 대체할 수 있다.
 */
export interface PushMessage {
  title: string;
  body: string;
  /** FE 딥링크 처리용 데이터(type/tripId/notificationId 등). FCM data는 문자열만 허용. */
  data?: Record<string, string>;
}

export interface PushSendResult {
  successCount: number;
  failureCount: number;
  /** FCM이 미등록/무효라고 응답해 비활성화해야 할 토큰들. */
  invalidTokens: string[];
}

export interface PushSender {
  send(tokens: string[], message: PushMessage): Promise<PushSendResult>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');
