import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { ScheduleService } from './schedule.service';

/**
 * API 명세서 §2.5: GET /trips/{tripId}/ai-requests — AI 계획 생성/수정 요청 이력.
 * ScheduleController와 base path가 달라(/schedule 밖) 별도 컨트롤러로 둔다.
 */
@UseGuards(JwtAuthGuard)
@Controller('trips/:tripId/ai-requests')
export class AiRequestsController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('tripId') tripId: string) {
    return this.scheduleService.listAiRequests(tripId, user.userId);
  }
}
