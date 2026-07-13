import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * API 명세서 §2.2 확장: GET /trips/{tripId}/places/search?keyword=
 * 후보 목록(areaBasedList)에 없는 장소도 키워드로 찾을 수 있게 한다.
 */
export class SearchPlacesQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  keyword: string;
}
