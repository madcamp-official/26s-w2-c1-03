import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TripsModule } from '../trips/trips.module';
import { CollaborationGateway } from './collaboration.gateway';

/**
 * 공동 편집 실시간 동기화(plan.md Phase 10). 자체 Entity 없이 TripsModule의
 * TripsService(소속 검증)를 재사용한다(§3.2 의도된 설계). JwtModule은 AuthModule과
 * 같은 이유로 기본값 없이 등록하고 검증 시 secret을 매번 지정한다.
 */
@Module({
  imports: [TripsModule, JwtModule.register({})],
  providers: [CollaborationGateway],
  exports: [CollaborationGateway],
})
export class CollaborationModule {}
