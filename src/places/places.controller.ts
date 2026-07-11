import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlacesService } from './places.service';

/** API 명세서 §2.2: GET /places/{placeId}. */
@UseGuards(JwtAuthGuard)
@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get(':placeId')
  getDetail(@Param('placeId') placeId: string) {
    return this.placesService.getPlaceDetail(placeId);
  }
}
