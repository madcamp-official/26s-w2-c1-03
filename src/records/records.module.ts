import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TravelRecord } from './entities/travel-record.entity';
import { RecordPhoto } from './entities/record-photo.entity';

/** Phase 3: Entity/Repository만. 사진 파이프라인 Controller/Service는 Phase 11·12에서 추가된다. */
@Module({
  imports: [TypeOrmModule.forFeature([TravelRecord, RecordPhoto])],
  exports: [TypeOrmModule],
})
export class RecordsModule {}
