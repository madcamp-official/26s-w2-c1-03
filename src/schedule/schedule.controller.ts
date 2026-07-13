import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import {
  AddSchedulePlaceDto,
  ReorderScheduleDto,
  UpdateSchedulePlaceDto,
} from './dto/edit-schedule.dto';
import { GenerateScheduleDto } from './dto/generate-schedule.dto';
import { ScheduleService } from './schedule.service';

/** API 명세서 §2.3(생성)·§2.4(수동 편집): /trips/{tripId}/schedule. */
@UseGuards(JwtAuthGuard)
@Controller('trips/:tripId/schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get()
  getSchedule(@CurrentUser() user: AuthenticatedUser, @Param('tripId') tripId: string) {
    return this.scheduleService.getSchedule(tripId, user.userId);
  }

  @Post('generate')
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Body() dto: GenerateScheduleDto,
  ) {
    return this.scheduleService.generate(tripId, user.userId, dto);
  }

  @Post('places')
  addPlace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Body() dto: AddSchedulePlaceDto,
  ) {
    return this.scheduleService.addPlace(tripId, user.userId, dto);
  }

  @Patch('places/:tripPlaceId')
  updatePlace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Param('tripPlaceId') tripPlaceId: string,
    @Body() dto: UpdateSchedulePlaceDto,
  ) {
    return this.scheduleService.updatePlace(tripId, user.userId, tripPlaceId, dto);
  }

  @Delete('places/:tripPlaceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePlace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Param('tripPlaceId') tripPlaceId: string,
  ) {
    return this.scheduleService.removePlace(tripId, user.userId, tripPlaceId);
  }

  @Patch('reorder')
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Body() dto: ReorderScheduleDto,
  ) {
    return this.scheduleService.reorder(tripId, user.userId, dto);
  }
}
