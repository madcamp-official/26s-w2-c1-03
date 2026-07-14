import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** API 명세서 §4 PATCH .../photos/{recordPhotoId} — 캡션/순서/대표사진(isCover) 수정. */
export class UpdateRecordPhotoDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caption?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @IsOptional()
  @IsBoolean()
  isCover?: boolean;
}
