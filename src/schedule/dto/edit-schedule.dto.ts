import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** 'HH:MM'(00:00~23:59) 형식만 허용. */
const START_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * API 명세서 §2.4 POST /trips/{tripId}/schedule/places — placeId 참조 또는
 * customName(/customAddress) 직접 입력 중 정확히 하나의 경로로 장소를 추가한다.
 */
export class AddSchedulePlaceDto {
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

  /** 생략하면 해당 날짜 맨 뒤에 추가한다. */
  @IsOptional()
  @IsInt()
  @Min(1)
  orderInDay?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  memo?: string;
}

/**
 * API 명세서 §2.4 PATCH — 메모/방문 시각/비용 수정(각각 null이면 삭제), dayNumber/orderInDay로
 * 개별 위치 이동. 상세 설정 탭(메모·시간·비용)이 한 번에 세 값을 저장할 때 이 DTO를 쓴다.
 */
export class UpdateSchedulePlaceDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  dayNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  orderInDay?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  memo?: string | null;

  @IsOptional()
  @Matches(START_TIME_PATTERN, { message: 'startTime은 HH:MM 형식이어야 합니다.' })
  startTime?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  cost?: number | null;
}

export class ReorderOperationDto {
  @IsUUID()
  tripPlaceId: string;

  @IsInt()
  @Min(1)
  dayNumber: number;

  @IsInt()
  @Min(1)
  orderInDay: number;
}

/** API 명세서 §2.4 PATCH /schedule/reorder — 드래그앤드롭 일괄 순서 변경(트랜잭션 처리). */
export class ReorderScheduleDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReorderOperationDto)
  operations: ReorderOperationDto[];
}
