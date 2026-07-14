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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { FinalizePhotosDto } from './dto/finalize-photos.dto';
import { RegisterPhotoMetadataDto } from './dto/register-photo-metadata.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { UpdateRecordPhotoDto } from './dto/update-record-photo.dto';
import { RecordsService } from './records.service';

@UseGuards(JwtAuthGuard)
@Controller('trips/:tripId/records')
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Post()
  startSession(@CurrentUser() user: AuthenticatedUser, @Param('tripId') tripId: string) {
    return this.recordsService.startSession(tripId, user.userId);
  }

  @Post(':recordId/photos/metadata')
  registerMetadata(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Param('recordId') recordId: string,
    @Body() dto: RegisterPhotoMetadataDto,
  ) {
    return this.recordsService.registerMetadata(tripId, recordId, user.userId, dto);
  }

  @Post(':recordId/photos/upload')
  @UseInterceptors(AnyFilesInterceptor({ limits: { files: 100, fileSize: 20 * 1024 * 1024 } }))
  uploadPhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Param('recordId') recordId: string,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.recordsService.uploadPhotos(tripId, recordId, user.userId, files);
  }

  @Post(':recordId/photos/curate')
  curate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Param('recordId') recordId: string,
  ) {
    return this.recordsService.curate(tripId, recordId, user.userId);
  }

  @Get(':recordId/photos/candidates')
  getCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Param('recordId') recordId: string,
  ) {
    return this.recordsService.getCandidates(tripId, recordId, user.userId);
  }

  @Post(':recordId/photos/finalize')
  finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Param('recordId') recordId: string,
    @Body() dto: FinalizePhotosDto,
  ) {
    return this.recordsService.finalize(tripId, recordId, user.userId, dto);
  }

  @Patch(':recordId/photos/:recordPhotoId')
  updatePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Param('recordId') recordId: string,
    @Param('recordPhotoId') recordPhotoId: string,
    @Body() dto: UpdateRecordPhotoDto,
  ) {
    return this.recordsService.updatePhoto(tripId, recordId, user.userId, recordPhotoId, dto);
  }

  @Delete(':recordId/photos/:recordPhotoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Param('recordId') recordId: string,
    @Param('recordPhotoId') recordPhotoId: string,
  ): Promise<void> {
    await this.recordsService.deletePhoto(tripId, recordId, user.userId, recordPhotoId);
  }

  @Patch(':recordId')
  updateRecord(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Param('recordId') recordId: string,
    @Body() dto: UpdateRecordDto,
  ) {
    return this.recordsService.updateRecord(tripId, recordId, user.userId, dto);
  }
}
