import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollaborationEventsModule } from '../collaboration/collaboration-events.module';
import { Trip } from './entities/trip.entity';
import { TripMember } from './entities/trip-member.entity';
import { TripInviteLink } from './entities/trip-invite-link.entity';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

/**
 * Phase 6: Trip CRUD Controller/Service. Phase 10에서 초대링크·멤버 관리가 추가됐고,
 * 참여자 입퇴장은 CollaborationEventBus로 발행해 Gateway가 브로드캐스트한다(순환
 * 의존 회피 — collaboration-event-bus.ts 주석 참고). TripsService.assertMember는
 * Schedule/Places/Records 도메인이 재사용할 수 있도록 exports에 함께 노출한다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Trip, TripMember, TripInviteLink]), CollaborationEventsModule],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TypeOrmModule, TripsService],
})
export class TripsModule {}
