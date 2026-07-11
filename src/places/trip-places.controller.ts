import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { ListCandidatesQueryDto } from './dto/list-candidates-query.dto';
import { PlacesService } from './places.service';

/** API 명세서 §2.2: GET /trips/{tripId}/places/candidates. */
@UseGuards(JwtAuthGuard)
@Controller('trips/:tripId/places')
export class TripPlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get('candidates')
  getCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Query() query: ListCandidatesQueryDto,
  ) {
    return this.placesService.getCandidates(tripId, user.userId, query);
  }
}
