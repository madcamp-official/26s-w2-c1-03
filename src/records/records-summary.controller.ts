import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { ListRecordsQueryDto } from './dto/list-records-query.dto';
import { RecordsService } from './records.service';

/**
 * API 명세서 §5 — `trips/:tripId`에 종속되지 않는 "내 기록 전체" 조회/삭제.
 * RecordsController(§4, `trips/:tripId/records` 하위)와 베이스 경로가 달라
 * 별도 컨트롤러로 둔다.
 */
@UseGuards(JwtAuthGuard)
@Controller('records')
export class RecordsSummaryController {
  constructor(private readonly recordsService: RecordsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListRecordsQueryDto) {
    return this.recordsService.listMyRecords(user.userId, query);
  }

  @Get(':recordId')
  getDetail(@CurrentUser() user: AuthenticatedUser, @Param('recordId') recordId: string) {
    return this.recordsService.getRecordDetail(recordId, user.userId);
  }

  @Delete(':recordId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('recordId') recordId: string,
  ): Promise<void> {
    await this.recordsService.deleteRecord(recordId, user.userId);
  }
}
