import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TravelRecordStatus } from '../entities/travel-record.entity';

/** API 명세서 §4 PATCH .../records/{recordId} — 일기 본문 작성/수정, draft→published 전환. */
export class UpdateRecordDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(TravelRecordStatus)
  status?: TravelRecordStatus;
}
