import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';

/**
 * 여행 종료 감지 배치 트리거(plan.md Phase 13). 매일 KST 새벽 1시에 실행해 "종료일
 * 다음날이 된" 여행을 완료 처리하고 기록 유도 푸시를 보낸다. 실제 로직은
 * NotificationsService(단위 테스트 대상)에 있고, 이 클래스는 스케줄만 담당한다 —
 * 그래야 테스트에서 시각을 주입해 배치 로직을 검증할 수 있다.
 */
@Injectable()
export class NotificationScheduler {
  private readonly logger = new Logger(NotificationScheduler.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM, { timeZone: 'Asia/Seoul' })
  async handleTripEndReminder(): Promise<void> {
    try {
      await this.notificationsService.runTripEndReminderBatch();
    } catch (error) {
      this.logger.error(`여행 종료 배치 실행 실패: ${(error as Error).message}`);
    }
  }
}
