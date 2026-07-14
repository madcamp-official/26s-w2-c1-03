import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollaborationEventsModule } from '../collaboration/collaboration-events.module';
import { PlacesModule } from '../places/places.module';
import { TripsModule } from '../trips/trips.module';
import {
  OpenAiScheduleClient,
  SCHEDULE_AI_CLIENT,
} from './client/open-ai-schedule.client';
import { AiRequestsController } from './ai-requests.controller';
import { AiPlanRequest } from './entities/ai-plan-request.entity';
import { TripPlace } from './entities/trip-place.entity';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';

/**
 * Phase 8: AI 여행 계획 생성. TripsModule(assertMember/getDetail)과
 * PlacesModule(resolveForSchedule)을 재사용하고, 스케줄 AI는 SCHEDULE_AI_CLIENT
 * 토큰으로 주입해 테스트에서 Mock으로 교체할 수 있게 한다(plan.md §9.1, §13).
 * 수동 편집/프롬프트 재수정(Phase 9), WebSocket 브로드캐스트(Phase 10)는 이후 추가된다.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TripPlace, AiPlanRequest]),
    TripsModule,
    PlacesModule,
    CollaborationEventsModule,
  ],
  controllers: [ScheduleController, AiRequestsController],
  providers: [
    ScheduleService,
    { provide: SCHEDULE_AI_CLIENT, useClass: OpenAiScheduleClient },
  ],
  // ScheduleService는 CollaborationModule(Phase 10 WS)이 schedule:op 적용에 재사용한다.
  exports: [TypeOrmModule, ScheduleService],
})
export class ScheduleModule {}
