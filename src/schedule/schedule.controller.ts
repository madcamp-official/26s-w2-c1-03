import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { GenerateScheduleDto } from './dto/generate-schedule.dto';
import { ScheduleService } from './schedule.service';

/** API 명세서 §2.3: POST /trips/{tripId}/schedule/generate (AI 일자별 동선 생성, 동기). */
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
}
