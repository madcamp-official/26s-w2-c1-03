import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '../schedule/schedule.module';
import { TripsModule } from '../trips/trips.module';
import { CollaborationGateway } from './collaboration.gateway';
import { ConflictResolutionService } from './conflict-resolution.service';

/**
 * 공동 편집 실시간 동기화(plan.md Phase 10). 자체 Entity 없이 TripsModule의
 * TripsService(소속 검증)와 ScheduleModule의 ScheduleService(op 적용)를 재사용한다
 * (§3.2 의도된 설계 — 새 테이블 없이 기존 스케줄 변경을 브로드캐스트만 한다).
 * JwtModule은 AuthModule과 같은 이유로 기본값 없이 등록하고 검증 시 secret을 매번 지정한다.
 */
@Module({
  imports: [TripsModule, ScheduleModule, JwtModule.register({})],
  providers: [CollaborationGateway, ConflictResolutionService],
  exports: [CollaborationGateway],
})
export class CollaborationModule {}
