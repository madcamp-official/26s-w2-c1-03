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
import { CreateInviteLinkDto } from './dto/create-invite-link.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
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

  // ── Phase 10: 초대 링크 (API 명세서 §3.1) ──────────────────────────

  @Post(':tripId/invite-links')
  createInviteLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Body() dto: CreateInviteLinkDto,
  ) {
    return this.tripsService.createInviteLink(tripId, user.userId, dto);
  }

  @Post('invite-links/:token/join')
  joinByToken(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    return this.tripsService.joinByToken(token, user.userId);
  }

  // ── Phase 10: 멤버 관리 (API 명세서 §3.1) ──────────────────────────

  @Get(':tripId/members')
  listMembers(@CurrentUser() user: AuthenticatedUser, @Param('tripId') tripId: string) {
    return this.tripsService.listMembers(tripId, user.userId);
  }

  /** 자진 탈퇴 — 아래 :userId 경로보다 먼저 선언해 'me'가 userId로 매칭되는 것을 막는다. */
  @Delete(':tripId/members/me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leaveTrip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
  ): Promise<void> {
    await this.tripsService.leaveTrip(tripId, user.userId);
  }

  @Patch(':tripId/members/:userId')
  updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.tripsService.updateMemberRole(tripId, user.userId, targetUserId, dto.role);
  }

  @Delete(':tripId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Param('userId') targetUserId: string,
  ): Promise<void> {
    await this.tripsService.removeMember(tripId, user.userId, targetUserId);
  }
}
