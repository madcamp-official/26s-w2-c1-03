import { Module } from '@nestjs/common';
import { CollaborationEventBus } from './collaboration-event-bus';

/**
 * CollaborationEventBus만 담는 최소 모듈. TripsModule/ScheduleModule(발행)과
 * CollaborationModule(구독)이 모두 import해도 이 모듈은 아무것도 import하지 않아
 * 순환 의존이 생기지 않는다.
 */
@Module({
  providers: [CollaborationEventBus],
  exports: [CollaborationEventBus],
})
export class CollaborationEventsModule {}
