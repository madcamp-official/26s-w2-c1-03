import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripsModule } from '../trips/trips.module';
import { GooglePlacesClient } from './clients/google-places.client';
import { TatsCnctrRateClient } from './clients/tats-cnctr-rate.client';
import { TourApiClient } from './clients/tour-api.client';
import { Place } from './entities/place.entity';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { TripPlacesController } from './trip-places.controller';

/**
 * Phase 7: TourAPI(국내 전용, 후보 소스) + Google Places API(New)(인기순 정렬용
 * 평점/리뷰수 — Kakao 로컬 API는 이 데이터를 제공하지 않아 대체) 연동.
 * TripsModule을 import하는 건 PlacesService가 TripsService.getDetail로 멤버십
 * 검증 + areaCode/sigunguCode 조회를 재사용하기 위함이다(plan.md §3.3).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Place]), TripsModule],
  controllers: [TripPlacesController, PlacesController],
  providers: [PlacesService, TourApiClient, GooglePlacesClient, TatsCnctrRateClient],
  // Schedule 도메인(Phase 8)이 PlacesService.resolveForSchedule로 선택 장소를 조회한다.
  exports: [TypeOrmModule, PlacesService],
})
export class PlacesModule {}
