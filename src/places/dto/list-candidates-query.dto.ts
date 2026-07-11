import { IsIn, IsOptional } from 'class-validator';

export const PLACE_CATEGORIES = ['tourist_spot', 'restaurant', 'shopping'] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

/**
 * API 명세서 §2.2 GET /trips/{tripId}/places/candidates: `?category=` (선택,
 * 서버 사이드 사전 필터용). TourAPI의 `contentTypeId`로만 필터링 가능한 범위로
 * 제한한다 — "카페"는 TourAPI에서 contentTypeId가 아니라 cat2/cat3 하위 분류로만
 * 구분되어 여기서는 별도 카테고리로 분리하지 않는다.
 */
export class ListCandidatesQueryDto {
  @IsOptional()
  @IsIn(PLACE_CATEGORIES)
  category?: PlaceCategory;
}
