import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripPlace } from './entities/trip-place.entity';
import { AiPlanRequest } from './entities/ai-plan-request.entity';

/** Phase 3: Entity/Repository만. AI 계획 생성/재수정 Controller/Service는 Phase 8·9에서 추가된다. */
@Module({
  imports: [TypeOrmModule.forFeature([TripPlace, AiPlanRequest])],
  exports: [TypeOrmModule],
})
export class ScheduleModule {}
