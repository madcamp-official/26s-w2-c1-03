import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trip } from './entities/trip.entity';
import { TripMember } from './entities/trip-member.entity';
import { TripInviteLink } from './entities/trip-invite-link.entity';

/** Phase 3: Entity/Repository만. Controller/Service는 Phase 6·10에서 추가된다. */
@Module({
  imports: [TypeOrmModule.forFeature([Trip, TripMember, TripInviteLink])],
  exports: [TypeOrmModule],
})
export class TripsModule {}
