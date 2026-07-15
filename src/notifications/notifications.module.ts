import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripsModule } from '../trips/trips.module';
import { UsersModule } from '../users/users.module';
import { NotificationLog } from './entities/notification-log.entity';
import { FcmClient } from './fcm.client';
import { NotificationScheduler } from './notification.scheduler';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PUSH_SENDER } from './push-sender';

/**
 * Phase 13: 여행 종료 감지 배치 + 기록 유도 푸시. notifications는 파생 도메인이라
 * (§1.4) 자체 Entity(NotificationLog)만 소유하고, 여행/디바이스는 TripsModule·
 * UsersModule이 노출한 Service를 통해서만 접근한다(§3.1). 발송은 PUSH_SENDER 토큰
 * 뒤의 FcmClient(Firebase Admin Messaging)로 위임하며, 테스트에서 Mock으로 교체된다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([NotificationLog]), TripsModule, UsersModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationScheduler,
    { provide: PUSH_SENDER, useClass: FcmClient },
  ],
  exports: [TypeOrmModule],
})
export class NotificationsModule {}
