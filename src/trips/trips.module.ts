import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trip } from './entities/trip.entity';
import { TripMember } from './entities/trip-member.entity';
import { TripInviteLink } from './entities/trip-invite-link.entity';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

/**
 * Phase 6: Trip CRUD Controller/Service 추가. 초대링크·멤버 관리(Phase 10)는
 * 아직 Entity/Repository만 노출된 상태다. TripsService.assertMember는 이후
 * Schedule/Places/Records 도메인이 재사용할 수 있도록 exports에 함께 노출한다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Trip, TripMember, TripInviteLink])],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TypeOrmModule, TripsService],
})
export class TripsModule {}
