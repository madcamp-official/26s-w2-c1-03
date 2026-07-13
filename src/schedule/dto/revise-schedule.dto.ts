import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** API 명세서 §2.5 POST /schedule/revise — 자연어 프롬프트로 전체 일정 재수정 제안 요청. */
export class ReviseScheduleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  prompt: string;
}

/** 제안 수용 항목 — placeId 참조 또는 customName 직접입력 중 정확히 하나. */
export class ApplyScheduleItemDto {
  @IsOptional()
  @IsUUID()
  placeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  customAddress?: string;

  @IsInt()
  @Min(1)
  dayNumber: number;

  @IsInt()
  @Min(1)
  orderInDay: number;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  memo?: string;
}

/**
 * POST /schedule/revise/apply — 유저가 미리보기에서 확인(일부 항목 제외 가능)한 최종
 * 일정으로 trip_places 전체를 교체한다. 빈 배열이면 일정 비우기.
 */
export class ApplyScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApplyScheduleItemDto)
  items: ApplyScheduleItemDto[];
}
