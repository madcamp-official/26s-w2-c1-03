import { IsIn, IsOptional } from 'class-validator';

export const PLACE_CATEGORIES = ['tourist_spot', 'restaurant', 'cafe', 'shopping'] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

/**
 * API 명세서 §2.2 GET /trips/{tripId}/places/candidates: `?category=` (선택,
 * 서버 사이드 사전 필터용). "맛집"/"카페"는 TourAPI에서 둘 다 음식점(contentTypeId
 * 39)으로 묶여 있어, PlacesService가 cat3(A05020900=카페/전통찻집) 하위 분류로
 * 서버에서 갈라 낸다(§places.service.ts fetchCategoryItems).
 */
export class ListCandidatesQueryDto {
  @IsOptional()
  @IsIn(PLACE_CATEGORIES)
  category?: PlaceCategory;
}
