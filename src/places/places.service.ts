import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TripsService } from '../trips/trips.service';
import {
  GooglePlaceResult,
  GooglePlacesClient,
  PlacePopularity,
} from './clients/google-places.client';
import {
  normalizePlaceName,
  TatsCnctrRateClient,
} from './clients/tats-cnctr-rate.client';
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
  /**
   * 관광지 집중률(방문 추이 예측, 0~100). 카테고리 후보를 방문 집중도 순으로 정렬한
   * 근거값 — 관광지(12)만 매칭되고 음식점/쇼핑·미매칭은 null(TourAPI 기본순 폴백).
   */
  concentrationRate: number | null;
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

  /**
   * 관광지 집중률(방문 추이 예측) 인메모리 캐시 — `${areaCd}:${signguCd}:${baseYmd}`
   * 기준. 데이터가 일 1회만 갱신되므로 같은 시군구·날짜 조합을 반복 조회할 때 외부
   * 호출을 하루 1회로 줄인다(공공누리 1유형이라 저장·캐싱 허용). 값은 정규화된
   * 관광지명 → 집중률 맵이다.
   */
  private readonly concentrationCache = new Map<
    string,
    { value: Map<string, number>; expiresAt: number }
  >();
  private static readonly CONCENTRATION_TTL_MS = 24 * 60 * 60 * 1000;
  /** 집중률 API가 제공하는 예측 창(현재일 기준 향후 30일) — 정렬 기준일이 이 범위를 벗어나면 오늘로 폴백. */
  private static readonly CONCENTRATION_WINDOW_DAYS = 30;

  constructor(
    @InjectRepository(Place) private readonly placeRepository: Repository<Place>,
    private readonly tripsService: TripsService,
    private readonly tourApiClient: TourApiClient,
    private readonly googlePlacesClient: GooglePlacesClient,
    private readonly tatsCnctrRateClient: TatsCnctrRateClient,
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

    // 방문 집중도 순 정렬용 데이터 — 시군구 단위 1회 조회로 후보 전체를 커버한다
    // (장소별 Google 매칭을 대체). 시군구 코드가 없으면 조회 불가라 TourAPI 기본순 폴백.
    const concentrationMap = await this.safeFetchConcentration(
      trip.areaCode,
      trip.sigunguCode,
      trip.startDate,
    );
    return { candidates: await this.buildCandidates(rawItems, concentrationMap) };
  }

  /**
   * 트립 지역·정렬 기준일로 관광지 집중률 맵(정규화 관광지명 → 집중률)을 가져온다.
   * 시군구 코드가 없거나 외부 호출이 실패하면 빈 맵을 반환해 후보 조회를 막지 않는다
   * (미매칭은 buildCandidates에서 TourAPI 기본순으로 뒤에 배치).
   */
  private async safeFetchConcentration(
    areaCd: string,
    signguCd: string | null,
    tripStartDate: string,
  ): Promise<Map<string, number>> {
    if (!signguCd) {
      return new Map();
    }
    const baseYmd = this.resolveConcentrationBaseYmd(tripStartDate);
    const cacheKey = `${areaCd}:${signguCd}:${baseYmd}`;
    const cached = this.concentrationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    try {
      const map = await this.tatsCnctrRateClient.fetchConcentrationMap({
        areaCd,
        signguCd,
        baseYmd,
      });
      this.concentrationCache.set(cacheKey, {
        value: map,
        expiresAt: Date.now() + PlacesService.CONCENTRATION_TTL_MS,
      });
      return map;
    } catch (error) {
      this.logger.warn(`관광지 집중률 조회 실패(${cacheKey}): ${(error as Error).message}`);
      return new Map();
    }
  }

  /**
   * 정렬 기준일(yyyymmdd)을 정한다. 여행 시작일이 집중률 예측 창(오늘~+30일) 안이면
   * 그 날의 혼잡 예측으로, 벗어나면(과거 여행이거나 한 달 이상 뒤) 오늘 기준으로 정렬한다.
   */
  private resolveConcentrationBaseYmd(tripStartDate: string): string {
    const toYmd = (d: Date): string =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
        d.getDate(),
      ).padStart(2, '0')}`;

    const today = new Date();
    const todayYmd = toYmd(today);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + PlacesService.CONCENTRATION_WINDOW_DAYS - 1);
    const maxYmd = toYmd(maxDate);

    const tripYmd = tripStartDate.replace(/-/g, '');
    return tripYmd >= todayYmd && tripYmd <= maxYmd ? tripYmd : todayYmd;
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
    // place_id만 저장하고(약관상 Google 콘텐츠는 저장 금지), 참조용 UUID를 얻는다.
    const places = await Promise.all(results.map((result) => this.upsertGooglePlaceId(result)));

    const withResult = results.map((result, index) => ({ result, place: places[index] }));
    withResult.sort((a, b) => this.googleResultScore(b.result) - this.googleResultScore(a.result));

    // 응답은 방금 받은 Google 결과(실시간)로 구성한다 — DB에 저장한 값이 아니다.
    return {
      candidates: withResult.map(({ result, place }) =>
        this.toGoogleCandidateDto(place.id, result),
      ),
    };
  }

  private googleResultScore(result: GooglePlaceResult): number {
    return this.popularityScore(
      result.rating !== null && result.reviewCount !== null
        ? { rating: result.rating, reviewCount: result.reviewCount }
        : null,
    );
  }

  /**
   * Google 검색 결과에 대해 place_id(externalId)만 places 테이블에 저장하고 참조용 행을
   * 돌려준다. Google Places 콘텐츠(장소명·주소·좌표)는 약관상 저장할 수 없으므로 저장하지
   * 않는다 — 표시가 필요할 때 place_id로 getPlaceDetails를 실시간 호출한다. 재검색 시
   * 예전에 저장됐을 수 있는 Google 콘텐츠도 함께 null로 지운다.
   */
  private async upsertGooglePlaceId(result: GooglePlaceResult): Promise<Place> {
    const existing = await this.placeRepository.findOneBy({
      source: PlaceSource.GOOGLE,
      externalId: result.externalId,
    });
    const place = existing ?? this.placeRepository.create({ source: PlaceSource.GOOGLE });

    place.externalId = result.externalId;
    place.name = null;
    place.address = null;
    place.latitude = null;
    place.longitude = null;
    place.contentTypeId = null;
    place.categoryCode = null;
    place.syncedAt = new Date();

    return this.placeRepository.save(place);
  }

  /**
   * rawItems(TourAPI) → places 캐시 벌크 upsert → 관광지 집중률(방문 추이 예측) 매칭 →
   * 방문 집중도 순 정렬 → DTO. 집중률이 매칭 안 되는 장소(음식점/쇼핑·미등록)는
   * TourAPI 기본순(수정일순)을 유지한 채 뒤로 보낸다.
   */
  private async buildCandidates(
    rawItems: TourApiPlaceItem[],
    concentrationMap: Map<string, number>,
  ): Promise<PlaceCandidateDto[]> {
    const places = await this.upsertPlaces(rawItems);

    // Array.prototype.sort는 안정 정렬이라 집중률이 같거나(둘 다 미매칭) 값이 없으면
    // TourAPI가 내려준 원래 순서가 보존된다.
    const withRate = places.map((place) => ({
      place,
      concentrationRate: place.name
        ? concentrationMap.get(normalizePlaceName(place.name)) ?? null
        : null,
    }));
    withRate.sort(
      (a, b) =>
        this.concentrationScore(b.concentrationRate) -
        this.concentrationScore(a.concentrationRate),
    );

    return withRate.map(({ place, concentrationRate }) =>
      this.toCandidateDto(place, null, concentrationRate),
    );
  }

  private concentrationScore(rate: number | null): number {
    return rate ?? UNMATCHED_SCORE;
  }

  async getPlaceDetail(placeId: string): Promise<PlaceCandidateDto> {
    const place = await this.placeRepository.findOneBy({ id: placeId });
    if (!place) {
      throw new BusinessException(PlacesErrorCode.PLACE_NOT_FOUND);
    }

    // Google 장소는 place_id만 저장돼 있어(장소명·주소·좌표 미저장), 표시 시 place_id로
    // Place Details를 실시간 조회한다 — 약관상 Google 콘텐츠를 DB에서 읽어 쓸 수 없다.
    if (place.source === PlaceSource.GOOGLE) {
      const details = place.externalId
        ? await this.googlePlacesClient.getPlaceDetails(place.externalId)
        : null;
      if (!details) {
        throw new BusinessException(PlacesErrorCode.PLACE_NOT_FOUND);
      }
      return this.toGoogleCandidateDto(place.id, details);
    }

    const popularity = await this.safeMatchGooglePlace(place);
    return this.toCandidateDto(place, popularity);
  }

  /**
   * (source, externalId) 기준 벌크 upsert — TourAPI 캐시 테이블이라 존재하면 최신 정보로
   * 갱신한다. 항목마다 findOneBy+save를 돌리지 않고 ON CONFLICT 한 번(+id 조회 한 번)으로
   * 처리해, 후보 30건 조회 시 DB 왕복을 2N에서 2로 줄인다. 반환 순서는 rawItems 순서를
   * 유지한다(정렬은 호출부가 담당). overview 등 여기서 안 건드리는 컬럼은 ON CONFLICT가
   * 덮어쓰지 않아 기존 값이 보존된다.
   */
  private async upsertPlaces(rawItems: TourApiPlaceItem[]): Promise<Place[]> {
    if (rawItems.length === 0) {
      return [];
    }

    const rows = rawItems.map((item) => ({
      source: PlaceSource.TOURAPI,
      externalId: item.contentId,
      contentTypeId: item.contentTypeId,
      name: item.title,
      address: [item.addr1, item.addr2].filter(Boolean).join(' ') || null,
      latitude: item.mapY,
      longitude: item.mapX,
      areaCode: item.areaCode,
      sigunguCode: item.sigunguCode,
      categoryCode: item.cat3 ?? item.cat2 ?? item.cat1,
      tel: item.tel,
      imageUrl: item.firstImage,
      syncedAt: new Date(),
    }));
    await this.placeRepository.upsert(rows, ['source', 'externalId']);

    const externalIds = rawItems.map((item) => item.contentId);
    const saved = await this.placeRepository.find({
      where: { source: PlaceSource.TOURAPI, externalId: In(externalIds) },
    });

    // upsert/find는 순서를 보장하지 않으므로 externalId로 rawItems 순서에 맞춰 재정렬한다.
    const byExternalId = new Map(saved.map((place) => [place.externalId, place]));
    return rawItems
      .map((item) => byExternalId.get(item.contentId))
      .filter((place): place is Place => place !== undefined);
  }

  /** Google Places 매칭 실패는 후보 전체 조회를 막지 않는다 — 미매칭으로 처리하고 계속 진행한다. */
  private async safeMatchGooglePlace(place: Place): Promise<PlacePopularity | null> {
    if (!place.name || !place.latitude || !place.longitude) {
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
    concentrationRate: number | null = null,
  ): PlaceCandidateDto {
    return {
      id: place.id,
      source: place.source,
      // 저장된 장소(tourapi/custom)는 항상 name이 있다. Google 행은 이 경로로 오지 않는다.
      name: place.name ?? '',
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
      concentrationRate,
    };
  }

  /**
   * Google 장소용 DTO — 저장된 값이 아니라 실시간 Google 결과(검색/상세)로 구성한다.
   * id는 참조용으로 저장해 둔 우리 쪽 UUID(place_id 자체가 아님)를 쓴다.
   */
  private toGoogleCandidateDto(placeId: string, result: GooglePlaceResult): PlaceCandidateDto {
    return {
      id: placeId,
      source: PlaceSource.GOOGLE,
      name: result.name,
      address: result.address,
      lat: result.latitude,
      lng: result.longitude,
      categoryCode: null,
      contentTypeId: null,
      imageUrl: null,
      overview: null,
      tel: null,
      rating: result.rating,
      reviewCount: result.reviewCount,
      concentrationRate: null,
    };
  }
}
