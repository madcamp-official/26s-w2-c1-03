import { Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * 종료 알림을 클릭해 기록 작성을 시작한 시각(clicked_at)을 기록한다(§4.7). FE가
   * 푸시 데이터의 notificationId로 이 엔드포인트를 호출한 뒤 기록 세션 화면으로 이동한다.
   */
  @Post(':notificationId/clicked')
  @HttpCode(HttpStatus.NO_CONTENT)
  markClicked(
    @CurrentUser() user: AuthenticatedUser,
    @Param('notificationId') notificationId: string,
  ): Promise<void> {
    return this.notificationsService.markClicked(notificationId, user.userId);
  }
}
