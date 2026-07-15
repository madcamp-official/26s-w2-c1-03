import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { DestinationsService } from './destinations.service';

/**
 * 홈 화면 "다음엔 여기 어때?" 추천(신규, plan.md 기존 계획에는 없던 기능).
 * 로그인 사용자만 접근 — 방문 지역 제외(개인화)를 위해 userId가 필요하다.
 */
@UseGuards(JwtAuthGuard)
@Controller('destinations')
export class DestinationsController {
  constructor(private readonly destinationsService: DestinationsService) {}

  @Get('recommendations')
  getRecommendations(@CurrentUser() user: AuthenticatedUser) {
    return this.destinationsService.getRecommendations(user.userId).then((items) => ({ items }));
  }

  /** 추천 카드 탭 → 상세 화면(대표 관광지 목록 포함). */
  @Get(':areaCode/:sigunguCode')
  getDetail(@Param('areaCode') areaCode: string, @Param('sigunguCode') sigunguCode: string) {
    return this.destinationsService.getDestinationDetail(areaCode, sigunguCode);
  }
}
