import { Body, Controller, Delete, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { TripsService } from '../trips/trips.service';
import { SetTripCoverDto } from './dto/set-trip-cover.dto';
import { RecordsService } from './records.service';

/**
 * 여행 대표사진(API 명세서 §2.6) — trips.cover_image_url을 본인 기록의
 * record_photos 중 하나로 지정/해제한다. RecordsModule에 두는 이유: recordPhotoId
 * 소유권 검증(요청자 본인이 작성한 기록의 사진인지, §4 비공개 원칙과 연동)에
 * RecordPhoto 저장소가 필요해서다 — TripsModule은 이 엔티티를 모른다.
 */
@UseGuards(JwtAuthGuard)
@Controller('trips/:tripId/cover')
export class TripCoverController {
  constructor(
    private readonly recordsService: RecordsService,
    private readonly tripsService: TripsService,
  ) {}

  @Put()
  async setCover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Body() dto: SetTripCoverDto,
  ) {
    await this.recordsService.setTripCover(tripId, user.userId, dto.recordPhotoId);
    return this.tripsService.getDetail(tripId, user.userId);
  }

  @Delete()
  async clearCover(@CurrentUser() user: AuthenticatedUser, @Param('tripId') tripId: string) {
    await this.recordsService.clearTripCover(tripId, user.userId);
    return this.tripsService.getDetail(tripId, user.userId);
  }
}
