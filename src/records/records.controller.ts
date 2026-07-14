import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { RecordsService } from './records.service';

@UseGuards(JwtAuthGuard)
@Controller('trips/:tripId/records')
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Post()
  startSession(@CurrentUser() user: AuthenticatedUser, @Param('tripId') tripId: string) {
    return this.recordsService.startSession(tripId, user.userId);
  }
}
