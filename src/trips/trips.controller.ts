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
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateTripDto } from './dto/create-trip.dto';
import { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripsService } from './trips.service';

@UseGuards(JwtAuthGuard)
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTripDto) {
    return this.tripsService.create(user.userId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTripsQueryDto) {
    return this.tripsService.list(user.userId, query);
  }

  @Get(':tripId')
  getDetail(@CurrentUser() user: AuthenticatedUser, @Param('tripId') tripId: string) {
    return this.tripsService.getDetail(tripId, user.userId);
  }

  @Patch(':tripId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Body() dto: UpdateTripDto,
  ) {
    return this.tripsService.update(tripId, user.userId, dto);
  }

  @Delete(':tripId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
  ): Promise<void> {
    await this.tripsService.remove(tripId, user.userId);
  }
}
