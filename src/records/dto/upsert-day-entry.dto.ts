import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Day 항목(제목/본문/대표사진) 생성 또는 수정 — PUT이라 없는 필드는 null로 지운다. */
export class UpsertDayEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  content?: string | null;

  @IsOptional()
  @IsUUID()
  photoId?: string | null;
}
