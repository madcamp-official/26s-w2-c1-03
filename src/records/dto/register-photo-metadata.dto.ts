import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class PhotoMetadataItemDto {
  @IsString()
  @MaxLength(200)
  localId: string;

  @IsDateString()
  takenAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationName?: string;
}

/**
 * API 명세서 §4 POST .../photos/metadata. 사진 실물은 이 요청에 포함되지 않는다
 * (텍스트 메타데이터만) — 최대 100장은 업로드 단계(§4 photos/upload)의 상한과
 * 동일하게 여기서도 방어적으로 검증한다.
 */
export class RegisterPhotoMetadataDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PhotoMetadataItemDto)
  photos: PhotoMetadataItemDto[];
}
