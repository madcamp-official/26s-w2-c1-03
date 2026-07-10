import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationLog } from './entities/notification-log.entity';

/** Phase 3: Entity/Repository만. 종료 감지 배치/푸시 발송 Service는 Phase 13에서 추가된다. */
@Module({
  imports: [TypeOrmModule.forFeature([NotificationLog])],
  exports: [TypeOrmModule],
})
export class NotificationsModule {}
