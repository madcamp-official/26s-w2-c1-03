import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class FinalizeSelectionDto {
  @IsUUID()
  photoRefId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caption?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}

/**
 * API 명세서 §4 POST .../photos/finalize — AI 추천 경로는 최대 15장 중 선택이라
 * 실질적으로 15장을 못 넘지만, 사용자 직접 선택 경로(curate 없이 UPLOADED 상태를
 * 그대로 finalize)는 업로드 상한과 동일하게 최대 100장까지 선택할 수 있어야
 * 한다 — 여기 상한을 15로 좁혀두면 직접 선택 모드에서 16장 이상 고를 때마다
 * 무조건 400으로 거부된다.
 */
export class FinalizePhotosDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FinalizeSelectionDto)
  selections: FinalizeSelectionDto[];
}
