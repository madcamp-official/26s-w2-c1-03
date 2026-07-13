import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TripsService } from '../trips/trips.service';
import {
  GooglePlaceResult,
  GooglePlacesClient,
  PlacePopularity,
} from './clients/google-places.client';
import {
  FetchAreaBasedListParams,
  TourApiClient,
  TourApiPlaceItem,
} from './clients/tour-api.client';
import { ListCandidatesQueryDto, PlaceCategory } from './dto/list-candidates-query.dto';
import { Place, PlaceSource } from './entities/place.entity';
import { BusinessException } from '../common/exceptions/business-exception';
import { PlacesErrorCode } from './exceptions/places-error-code';

export interface PlaceCandidateDto {
  id: string;
  source: PlaceSource;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  categoryCode: string | null;
  /** TourAPI contentTypeId(관광지 12/음식점 39/쇼핑 38). 클라이언트 사이드 카테고리 필터용. */
  contentTypeId: string | null;
  imageUrl: string | null;
  overview: string | null;
  tel: string | null;
  rating: number | null;
  reviewCount: number | null;
}

const CATEGORY_TO_CONTENT_TYPE_ID: Record<PlaceCategory, string> = {
  tourist_spot: '12',
  restaurant: '39',
  shopping: '38',
};

/** 매칭 안 된 장소(rating=null)는 항상 매칭된 장소보다 뒤로 보낸다(API 명세서 §2.2). */
const UNMATCHED_SCORE = -1;

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  /**
   * Google Places 인기도(평점/리뷰수) 인메모리 캐시 — place.id 기준. 같은 장소를
   * 재조회/다른 트립에서 다시 볼 때마다 Google Places를 다시 호출하지 않도록 TTL
   * 동안 결과를 재사용해 외부 API 요청을 줄인다(단일 서버 배포 전제, plan.md §14).
   * 매칭 실패(null)도 캐시해 매칭 안 되는 장소를 반복 조회하지 않는다.
   */
  private readonly popularityCache = new Map<
    string,
    { value: PlacePopularity | null; expiresAt: number }
  >();
  private static readonly POPULARITY_TTL_MS = 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(Place) private readonly placeRepository: Repository<Place>,
    private readonly tripsService: TripsService,
    private readonly tourApiClient: TourApiClient,
    private readonly googlePlacesClient: GooglePlacesClient,
  ) {}

  async getCandidates(
    tripId: string,
    userId: string,
    query: ListCandidatesQueryDto,
  ): Promise<{ candidates: PlaceCandidateDto[] }> {
    // getDetail이 멤버십 검증까지 함께 해준다(TRIP_NOT_FOUND/TRIP_FORBIDDEN은 그대로 전파).
    const trip = await this.tripsService.getDetail(tripId, userId);
    if (!trip.areaCode) {
      throw new BusinessException(PlacesErrorCode.AREA_CODE_REQUIRED);
    }

    const fetchParams: FetchAreaBasedListParams = {
      areaCode: trip.areaCode,
      sigunguCode: trip.sigunguCode ?? undefined,
      contentTypeId: query.category ? CATEGORY_TO_CONTENT_TYPE_ID[query.category] : undefined,
    };
    const rawItems = await this.tourApiClient.fetchAreaBasedList(fetchParams);
    return { candidates: await this.buildCandidates(rawItems) };
  }

  /**
   * 키워드로 장소를 검색한다(Google Places Text Search). TourAPI searchKeyword2는
   * 한국관광공사에 등록된 콘텐츠만 포함해 정확한 지명·식당·카페가 안 잡히는 경우가
   * 많아 Google Places로 대체했다. 결과는 places 테이블에 source=google로 캐싱해
   * 선택 시 place_id로 참조할 수 있게 하고, 평점/리뷰수는 검색 응답 값으로 인기순
   * 정렬한다(검색 1회 = Google 요청 1회, 별도 matchPlace 호출 없음).
   */
  async searchCandidates(
    tripId: string,
    userId: string,
    keyword: string,
  ): Promise<{ candidates: PlaceCandidateDto[] }> {
    // 멤버십 검증(TRIP_NOT_FOUND/TRIP_FORBIDDEN 전파). 검색은 areaCode가 필요 없다.
    await this.tripsService.getDetail(tripId, userId);

    const results = await this.googlePlacesClient.searchText(keyword);
    const places = await Promise.all(results.map((result) => this.upsertGooglePlace(result)));

    const withPopularity = results.map((result, index) => ({
      place: places[index],
      popularity:
        result.rating !== null && result.reviewCount !== null
          ? { rating: result.rating, reviewCount: result.reviewCount }
          : null,
    }));
    withPopularity.sort(
      (a, b) => this.popularityScore(b.popularity) - this.popularityScore(a.popularity),
    );

    return {
      candidates: withPopularity.map(({ place, popularity }) =>
        this.toCandidateDto(place, popularity),
      ),
    };
  }

  /** Google Places 검색 결과를 places 캐시에 upsert한다(source=google, externalId=Google place id). */
  private async upsertGooglePlace(result: GooglePlaceResult): Promise<Place> {
    const existing = await this.placeRepository.findOneBy({
      source: PlaceSource.GOOGLE,
      externalId: result.externalId,
    });
    const place = existing ?? this.placeRepository.create({ source: PlaceSource.GOOGLE });

    place.externalId = result.externalId;
    place.name = result.name;
    place.address = result.address;
    place.latitude = result.latitude !== null ? String(result.latitude) : null;
    place.longitude = result.longitude !== null ? String(result.longitude) : null;
    // Google 검색 결과는 TourAPI 카테고리 체계(contentTypeId/cat)가 없다.
    place.contentTypeId = null;
    place.categoryCode = null;
    place.syncedAt = new Date();

    return this.placeRepository.save(place);
  }

  /** rawItems(TourAPI) → places 캐시 upsert → Google Places 인기도 매칭 → 인기순 정렬 → DTO. */
  private async buildCandidates(rawItems: TourApiPlaceItem[]): Promise<PlaceCandidateDto[]> {
    const cachedPlaces = await Promise.all(rawItems.map((item) => this.upsertPlace(item)));

    const withPopularity = await Promise.all(
      cachedPlaces.map(async (place) => ({
        place,
        popularity: await this.safeMatchGooglePlace(place),
      })),
    );

    withPopularity.sort(
      (a, b) => this.popularityScore(b.popularity) - this.popularityScore(a.popularity),
    );

    return withPopularity.map(({ place, popularity }) =>
      this.toCandidateDto(place, popularity),
    );
  }

  async getPlaceDetail(placeId: string): Promise<PlaceCandidateDto> {
    const place = await this.placeRepository.findOneBy({ id: placeId });
    if (!place) {
      throw new BusinessException(PlacesErrorCode.PLACE_NOT_FOUND);
    }
    const popularity = await this.safeMatchGooglePlace(place);
    return this.toCandidateDto(place, popularity);
  }

  /** (source, externalId) 기준 upsert — TourAPI 캐시 테이블이라 존재하면 최신 정보로 갱신한다. */
  private async upsertPlace(item: TourApiPlaceItem): Promise<Place> {
    const existing = await this.placeRepository.findOneBy({
      source: PlaceSource.TOURAPI,
      externalId: item.contentId,
    });
    const place = existing ?? this.placeRepository.create({ source: PlaceSource.TOURAPI });

    place.externalId = item.contentId;
    place.contentTypeId = item.contentTypeId;
    place.name = item.title;
    place.address = [item.addr1, item.addr2].filter(Boolean).join(' ') || null;
    place.latitude = item.mapY;
    place.longitude = item.mapX;
    place.areaCode = item.areaCode;
    place.sigunguCode = item.sigunguCode;
    place.categoryCode = item.cat3 ?? item.cat2 ?? item.cat1;
    place.tel = item.tel;
    place.imageUrl = item.firstImage;
    place.syncedAt = new Date();

    return this.placeRepository.save(place);
  }

  /** Google Places 매칭 실패는 후보 전체 조회를 막지 않는다 — 미매칭으로 처리하고 계속 진행한다. */
  private async safeMatchGooglePlace(place: Place): Promise<PlacePopularity | null> {
    if (!place.latitude || !place.longitude) {
      return null;
    }
    const cached = this.popularityCache.get(place.id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    try {
      const popularity = await this.googlePlacesClient.matchPlace({
        name: place.name,
        latitude: Number(place.latitude),
        longitude: Number(place.longitude),
      });
      this.popularityCache.set(place.id, {
        value: popularity,
        expiresAt: Date.now() + PlacesService.POPULARITY_TTL_MS,
      });
      return popularity;
    } catch (error) {
      this.logger.warn(`Google Places 매칭 실패(placeId=${place.id}): ${(error as Error).message}`);
      return null;
    }
  }

  private popularityScore(popularity: { rating: number; reviewCount: number } | null): number {
    if (!popularity) {
      return UNMATCHED_SCORE;
    }
    // 평점만으로는 리뷰 1개짜리 5점이 리뷰 1만 개짜리 4.5점을 이겨버리므로, 리뷰수에
    // 로그 가중치를 곱해 표본 크기를 반영한 단순 인기도 점수를 쓴다.
    return popularity.rating * Math.log10(popularity.reviewCount + 1);
  }

  private toCandidateDto(
    place: Place,
    popularity: { rating: number; reviewCount: number } | null,
  ): PlaceCandidateDto {
    return {
      id: place.id,
      source: place.source,
      name: place.name,
      address: place.address,
      lat: place.latitude ? Number(place.latitude) : null,
      lng: place.longitude ? Number(place.longitude) : null,
      categoryCode: place.categoryCode,
      contentTypeId: place.contentTypeId,
      imageUrl: place.imageUrl,
      overview: place.overview,
      tel: place.tel,
      rating: popularity?.rating ?? null,
      reviewCount: popularity?.reviewCount ?? null,
    };
  }
}
