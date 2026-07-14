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

/** API 명세서 §4 POST .../photos/finalize — 추천 사진(최대 15장) 중 사용자 최종 선택. */
export class FinalizePhotosDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => FinalizeSelectionDto)
  selections: FinalizeSelectionDto[];
}
