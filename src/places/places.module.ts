import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Place } from './entities/place.entity';

/** Phase 3: Entity/Repository만. TourAPI/Kakao 연동 Controller/Service는 Phase 7에서 추가된다. */
@Module({
  imports: [TypeOrmModule.forFeature([Place])],
  exports: [TypeOrmModule],
})
export class PlacesModule {}
