import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module';
import { TripsModule } from '../trips/trips.module';
import { DestinationsController } from './destinations.controller';
import { DestinationsService } from './destinations.service';

/**
 * 홈 화면 "다음엔 여기 어때?" 추천(신규). 자체 Entity가 없는 파생 도메인 —
 * PlacesModule(지역 하이라이트)·TripsModule(방문 지역 제외)이 노출한 Service만
 * 통해 데이터에 접근한다(§3.1).
 */
@Module({
  imports: [PlacesModule, TripsModule],
  controllers: [DestinationsController],
  providers: [DestinationsService],
})
export class DestinationsModule {}
