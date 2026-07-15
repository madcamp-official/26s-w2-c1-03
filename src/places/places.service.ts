import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TripsService } from '../trips/trips.service';
import {
  GooglePlaceResult,
  GooglePlacesClient,
  GoogleReview,
  PlacePopularity,
} from './clients/google-places.client';
import {
  normalizePlaceName,
  TatsCnctrRateClient,
} from './clients/tats-cnctr-rate.client';
import { TourApiClient, TourApiPlaceItem } from './clients/tour-api.client';
import { ListCandidatesQueryDto, PlaceCategory } from './dto/list-candidates-query.dto';
import { Place, PlaceSource } from './entities/place.entity';
import { BusinessException } from '../common/exceptions/business-exception';
import { haversineKm } from '../common/utils/geo.util';
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
  /**
   * Google 리뷰(최대 5개). 상세 조회(getPlaceDetail) 응답에만 채워지고, 목록/검색
   * 응답은 항상 빈 배열 — 리뷰 조회는 비용이 큰 필드라 사용자가 상세를 열 때만 부른다.
   */
  reviews: PlaceReviewDto[];
}

export interface PlaceReviewDto {
  authorName: string;
  rating: number;
  text: string | null;
  relativeTime: string | null;
  profilePhotoUrl: string | null;
}

/** 스케줄 관점의 장소 분류 — 식사 시간 배치(restaurant/cafe)와 관광 배치(attraction)를 가른다. */
export type SchedulePlaceCategory = 'attraction' | 'restaurant' | 'cafe';

/**
 * 스케줄 생성(Phase 8)이 필요로 하는 최소 장소 정보. Schedule 도메인은 places
 * 테이블에 직접 접근하지 않고 이 메서드로만 장소를 조회한다(plan.md §3.1 의존 방향).
 */
export interface ScheduledPlaceInfo {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  categoryCode: string | null;
  category: SchedulePlaceCategory;
  imageUrl: string | null;
}

/** 스케줄 생성용 카테고리별 보강 후보 풀 — 선택 장소 중심좌표에서 가까운 순으로 정렬돼 있다. */
export interface ScheduleCandidatePools {
  attractions: ScheduledPlaceInfo[];
  restaurants: ScheduledPlaceInfo[];
  cafes: ScheduledPlaceInfo[];
}

export interface ScheduleCandidatePoolLimits {
  attractions: number;
  restaurants: number;
  cafes: number;
}

/**
 * 지역 대표 하이라이트 — destinations 도메인("다음엔 여기 어때?" 추천)이 소비한다.
 * score는 오늘 기준 관광지 집중률 평균(0~100, 데이터 없으면 0), imageUrl은 대표
 * 관광지 사진(TourAPI 캐시, 없으면 null → FE가 그라디언트 플레이스홀더로 대체).
 */
export interface AreaHighlight {
  score: number;
  imageUrl: string | null;
}

/** TourAPI contentTypeId — 맛집/카페는 TourAPI에 별도 contentTypeId가 없어 둘 다 39다. */
const CATEGORY_TO_CONTENT_TYPE_ID: Record<PlaceCategory, string> = {
  tourist_spot: '12',
  restaurant: '39',
  cafe: '39',
  shopping: '38',
};

/** TourAPI contentTypeId — 스케줄 후보 풀 조회용. */
const CONTENT_TYPE_TOURIST_SPOT = '12';
const CONTENT_TYPE_RESTAURANT = '39';
/** TourAPI 음식점(39) 소분류 중 카페/전통찻집 cat3 코드. */
const CAT3_CAFE = 'A05020900';

/** 매칭 안 된 장소(rating=null)는 항상 매칭된 장소보다 뒤로 보낸다(API 명세서 §2.2). */
const UNMATCHED_SCORE = -1;

/**
 * 지역 동기화·"전체" 조회에서 다루는 카테고리. contentTypeId 없이 한 번에 조회하면
 * TourAPI가 숙박(32)·여행코스(25, 좌표 없음)·행사/축제(15) 등 후보로 부적절한 항목까지
 * 섞어 내려주므로, 관광지/음식점/쇼핑만 카테고리별로 나눠 받아 적재·조회한다.
 */
const UNCATEGORIZED_FETCH_CATEGORIES: readonly PlaceCategory[] = [
  'tourist_spot',
  'restaurant',
  'shopping',
];

/** 맛집/카페 카테고리 요청 시 음식점(39)을 넉넉히 받아 cat3로 걸러낸다(필터링 후에도 후보가 부족하지 않게). */
const CATEGORY_FOOD_FETCH_ROWS = 60;

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

  /**
   * 지역 후보 캐시 유효기간 — 이 기간 안에는 TourAPI를 다시 부르지 않고 DB에서 읽는다.
   * TourAPI 지역 관광정보는 변동이 드물어(신규 등록/폐업 반영이 느림) 7일이면 충분하며,
   * 필요 시 값만 늘리면 된다. 공공누리 1유형이라 저장·캐싱이 약관상 허용된다.
   */
  private static readonly AREA_SYNC_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  /** 콜드 동기화 시 카테고리(관광지/음식점/쇼핑)별로 받아 적재할 행 수 — 카테고리 탭이 충분히 채워지도록 넉넉히. */
  private static readonly SYNC_ROWS_PER_CATEGORY = 50;
  /** "전체" 응답에서 카테고리별로 내려줄 후보 수 상한(균형 유지). */
  private static readonly CANDIDATE_ROWS_PER_CATEGORY = 30;
  /** 단일 카테고리(관광지/쇼핑) 응답 후보 수 상한. */
  private static readonly SINGLE_CATEGORY_LIMIT = 60;

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
    const sigunguCode = trip.sigunguCode ?? undefined;

    // 성능 핵심: TourAPI(data.go.kr)는 응답이 느려 매 조회마다 라이브 호출하면 체감이
    // 크게 나빠진다. 공공누리 1유형이라 저장이 허용되므로(TourAPI 데이터), 지역 단위로
    // 한 번만 받아 places 테이블에 적재하고 이후 TTL(7일) 동안은 DB에서 바로 읽는다.
    await this.ensureAreaSynced(trip.areaCode, sigunguCode);
    const places = await this.queryCachedPlaces(trip.areaCode, sigunguCode, query.category);

    // 방문 집중도 순 정렬용 데이터 — 시군구 단위 1회 조회로 후보 전체를 커버한다
    // (장소별 Google 매칭을 대체). 시군구 코드가 없으면 조회 불가라 TourAPI 기본순 폴백.
    const concentrationMap = await this.safeFetchConcentration(
      trip.areaCode,
      trip.sigunguCode,
      trip.startDate,
    );
    return { candidates: this.sortAndMapCandidates(places, concentrationMap) };
  }

  /**
   * 지역의 TourAPI 후보 캐시가 없거나 오래됐으면(TTL 초과) 한 번 동기화한다. 신선한
   * 캐시가 있으면 아무 것도 하지 않아 TourAPI를 건드리지 않는다. 콜드 상태(캐시가
   * 아예 없음)에서 동기화가 실패하면 보여줄 데이터가 없으므로 에러를 전파하고(기존
   * 라이브 조회와 동일한 실패 동작), 캐시가 이미 있으면 stale이어도 그대로 서비스한다.
   */
  private async ensureAreaSynced(areaCode: string, sigunguCode?: string): Promise<void> {
    const cache = await this.getAreaCacheState(areaCode, sigunguCode);
    if (cache.fresh) {
      return;
    }
    try {
      await this.syncArea(areaCode, sigunguCode);
    } catch (error) {
      if (!cache.hasAny) {
        throw error;
      }
      this.logger.warn(
        `TourAPI 지역 동기화 실패, 기존 캐시로 폴백(area=${areaCode}, sigungu=${sigunguCode ?? '-'}): ${(error as Error).message}`,
      );
    }
  }

  /** 지역 캐시 상태 — 캐시 존재 여부(hasAny)와 TTL 내 신선 여부(fresh). */
  private async getAreaCacheState(
    areaCode: string,
    sigunguCode?: string,
  ): Promise<{ hasAny: boolean; fresh: boolean }> {
    const newest = await this.placeRepository.findOne({
      where: {
        source: PlaceSource.TOURAPI,
        areaCode,
        ...(sigunguCode ? { sigunguCode } : {}),
      },
      order: { syncedAt: 'DESC' },
    });
    if (!newest?.syncedAt) {
      return { hasAny: !!newest, fresh: false };
    }
    const fresh = Date.now() - newest.syncedAt.getTime() < PlacesService.AREA_SYNC_TTL_MS;
    return { hasAny: true, fresh };
  }

  /**
   * 지역의 관광지(12)/음식점(39)/쇼핑(38)을 각각 넉넉히 받아 places 테이블에 적재한다.
   * 카테고리별로 나눠 받는 이유는 contentTypeId 없이 조회하면 숙박·여행코스·행사 등
   * 후보로 부적절한 항목이 섞이기 때문(§UNCATEGORIZED_FETCH_CATEGORIES 주석과 동일 이유).
   */
  private async syncArea(areaCode: string, sigunguCode?: string): Promise<void> {
    const baseParams = { areaCode, sigunguCode };
    const results = await Promise.all(
      UNCATEGORIZED_FETCH_CATEGORIES.map((category) =>
        this.tourApiClient.fetchAreaBasedList({
          ...baseParams,
          contentTypeId: CATEGORY_TO_CONTENT_TYPE_ID[category],
          numOfRows: PlacesService.SYNC_ROWS_PER_CATEGORY,
        }),
      ),
    );

    // 같은 contentId가 여러 카테고리에 중복으로 내려올 수 있어 먼저 나온 것을 유지한다.
    const byContentId = new Map<string, TourApiPlaceItem>();
    for (const item of results.flat()) {
      if (!byContentId.has(item.contentId)) {
        byContentId.set(item.contentId, item);
      }
    }
    await this.upsertPlaceRows([...byContentId.values()]);
  }

  /**
   * DB에 적재된 지역 후보를 카테고리에 맞게 읽는다(TourAPI 라이브 호출 없음). "전체"는
   * 관광지/음식점/쇼핑을 각각 상한만큼 받아 합쳐 카테고리 균형을 유지한다 — FE가
   * 클라이언트 사이드로 카테고리 탭을 거르므로 각 카테고리가 충분히 채워져 있어야 한다.
   */
  private async queryCachedPlaces(
    areaCode: string,
    sigunguCode: string | undefined,
    category?: PlaceCategory,
  ): Promise<Place[]> {
    if (!category) {
      const [spots, foods, shops] = await Promise.all(
        UNCATEGORIZED_FETCH_CATEGORIES.map((c) =>
          this.queryByContentType(
            areaCode,
            sigunguCode,
            CATEGORY_TO_CONTENT_TYPE_ID[c],
            PlacesService.CANDIDATE_ROWS_PER_CATEGORY,
          ),
        ),
      );
      // 음식점(39)과 쇼핑/관광이 겹칠 일은 없지만 방어적으로 중복 제거한다.
      return this.dedupePlaces([...spots, ...foods, ...shops]);
    }

    if (category === 'restaurant' || category === 'cafe') {
      const foods = await this.queryByContentType(
        areaCode,
        sigunguCode,
        CONTENT_TYPE_RESTAURANT,
        CATEGORY_FOOD_FETCH_ROWS,
      );
      const wantCafe = category === 'cafe';
      return foods.filter((place) => (place.categoryCode === CAT3_CAFE) === wantCafe);
    }

    return this.queryByContentType(
      areaCode,
      sigunguCode,
      CATEGORY_TO_CONTENT_TYPE_ID[category],
      PlacesService.SINGLE_CATEGORY_LIMIT,
    );
  }

  /** 한 contentTypeId의 지역 후보를 최신 동기화순으로 상한만큼 읽는다((areaCode, sigunguCode) 인덱스 활용). */
  private queryByContentType(
    areaCode: string,
    sigunguCode: string | undefined,
    contentTypeId: string,
    limit: number,
  ): Promise<Place[]> {
    return this.placeRepository.find({
      where: {
        source: PlaceSource.TOURAPI,
        areaCode,
        ...(sigunguCode ? { sigunguCode } : {}),
        contentTypeId,
      },
      order: { syncedAt: 'DESC' },
      take: limit,
    });
  }

  private dedupePlaces(places: Place[]): Place[] {
    const byId = new Map<string, Place>();
    for (const place of places) {
      if (!byId.has(place.id)) {
        byId.set(place.id, place);
      }
    }
    return [...byId.values()];
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
   * 지역 대표 "하이라이트"(오늘 기준 관광지 집중률 평균 + 대표 이미지) — destinations
   * 도메인(홈 화면 "다음엔 여기 어때?" 추천)이 재사용하는 진입점. Repository를 직접
   * 건드리지 않고 이 메서드로만 places 데이터에 접근한다(§3.1). getCandidates와 같은
   * 지역 캐시(ensureAreaSynced/TTL 7일)를 재사용하므로 반복 호출 시 대부분 DB만 읽는다.
   */
  async getAreaHighlight(areaCode: string, sigunguCode: string): Promise<AreaHighlight> {
    const empty: AreaHighlight = { score: 0, imageUrl: null };
    try {
      await this.ensureAreaSynced(areaCode, sigunguCode);
    } catch (error) {
      this.logger.warn(
        `지역 하이라이트 조회 실패(area=${areaCode}, sigungu=${sigunguCode}): ${(error as Error).message}`,
      );
      return empty;
    }

    const spots = await this.queryByContentType(areaCode, sigunguCode, CONTENT_TYPE_TOURIST_SPOT, 10);
    if (spots.length === 0) {
      return empty;
    }

    const concentrationMap = await this.safeFetchConcentration(
      areaCode,
      sigunguCode,
      PlacesService.todayDateString(),
    );
    const scored = spots.map((place) => ({
      place,
      rate: place.name ? concentrationMap.get(normalizePlaceName(place.name)) ?? null : null,
    }));

    const matched = scored.filter((s): s is { place: Place; rate: number } => s.rate !== null);
    const score =
      matched.length > 0 ? matched.reduce((sum, s) => sum + s.rate, 0) / matched.length : 0;

    // 대표 이미지 — 집중률 높은 순으로 훑어 이미지가 있는 첫 장소를 쓴다(가장 눈에 띄는 관광지 우선).
    const withImage = [...scored]
      .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))
      .find((s) => s.place.imageUrl);

    return { score, imageUrl: withImage?.place.imageUrl ?? null };
  }

  private static todayDateString(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
   * DB에서 읽은 places → 관광지 집중률(방문 추이 예측) 매칭 → 방문 집중도 순 정렬 →
   * DTO. 집중률이 매칭 안 되는 장소(음식점/쇼핑·미등록)는 조회 순서를 유지한 채 뒤로 보낸다.
   */
  private sortAndMapCandidates(
    places: Place[],
    concentrationMap: Map<string, number>,
  ): PlaceCandidateDto[] {
    // Array.prototype.sort는 안정 정렬이라 집중률이 같거나(둘 다 미매칭) 값이 없으면
    // DB에서 읽어온 순서(최신 동기화순)가 보존된다.
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

  /**
   * 선택된 place.id 목록을 스케줄 생성용 정보로 해석한다(Schedule 도메인이 재사용).
   * 입력 순서를 보존하며, Google 장소(name 미저장)는 place_id로 실시간 상세 조회해
   * 이름을 채운다. 존재하지 않거나(삭제됨) Google 상세 조회가 실패한 id는 결과에서
   * 빠지므로, 호출부는 반환 개수를 입력 개수와 비교해 유효성을 검증한다.
   */
  async resolveForSchedule(ids: string[]): Promise<ScheduledPlaceInfo[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return [];
    }

    const places = await this.placeRepository.find({ where: { id: In(uniqueIds) } });
    const byId = new Map(places.map((place) => [place.id, place]));

    const infos: ScheduledPlaceInfo[] = [];
    for (const id of uniqueIds) {
      const place = byId.get(id);
      if (!place) {
        continue;
      }
      const info = await this.toScheduledInfo(place);
      if (info) {
        infos.push(info);
      }
    }
    return infos;
  }

  /**
   * 스케줄 생성에서 사용자가 고른 필수 장소 외에 함께 고려할 카테고리별 보강 후보 풀을
   * 가져온다. 관광지(12)와 음식점(39)을 조회하고, 음식점은 cat3로 식당/카페를 분리한 뒤,
   * 각 풀을 선택 장소 중심좌표(anchors)에서 가까운 순으로 정렬해 반환한다 — 동선(거리·이동
   * 시간)을 실제로 반영하려면 애초에 가까운 후보를 AI에 줘야 한다. 후보 조회 실패가 전체
   * 스케줄 생성을 막지는 않도록 빈 풀로 폴백한다.
   *
   * getCandidates와 동일한 지역 캐시를 재사용한다 — 사용자는 보통 후보를 둘러본 뒤
   * 스케줄을 만들기 때문에 이 시점엔 캐시가 이미 채워져 있어 TourAPI를 다시 부르지 않는다.
   */
  async getScheduleCandidatePools(
    tripId: string,
    userId: string,
    anchors: Array<{ lat: number; lng: number }>,
    excludeIds: string[],
    limits: ScheduleCandidatePoolLimits,
  ): Promise<ScheduleCandidatePools> {
    const empty: ScheduleCandidatePools = { attractions: [], restaurants: [], cafes: [] };
    try {
      const trip = await this.tripsService.getDetail(tripId, userId);
      if (!trip.areaCode) {
        return empty;
      }
      const sigunguCode = trip.sigunguCode ?? undefined;
      await this.ensureAreaSynced(trip.areaCode, sigunguCode);

      const [touristPlaces, foodPlaces] = await Promise.all([
        this.queryByContentType(trip.areaCode, sigunguCode, CONTENT_TYPE_TOURIST_SPOT, 40),
        // 카페가 소분류라 식당 풀과 함께 오도록 넉넉히 받는다.
        this.queryByContentType(trip.areaCode, sigunguCode, CONTENT_TYPE_RESTAURANT, 60),
      ]);

      const excluded = new Set(excludeIds);
      const toSortedInfos = async (places: Place[]): Promise<ScheduledPlaceInfo[]> => {
        const infos: ScheduledPlaceInfo[] = [];
        for (const place of places) {
          if (excluded.has(place.id)) {
            continue;
          }
          const info = await this.toScheduledInfo(place);
          if (info) {
            infos.push(info);
          }
        }
        return this.sortByDistanceToAnchors(infos, anchors);
      };

      const [attractions, foods] = await Promise.all([
        toSortedInfos(touristPlaces),
        toSortedInfos(foodPlaces),
      ]);
      return {
        attractions: attractions.slice(0, limits.attractions),
        restaurants: foods
          .filter((info) => info.category === 'restaurant')
          .slice(0, limits.restaurants),
        cafes: foods.filter((info) => info.category === 'cafe').slice(0, limits.cafes),
      };
    } catch (error) {
      this.logger.warn(`스케줄 보강 후보 조회 실패: ${(error as Error).message}`);
      return empty;
    }
  }

  /**
   * anchors(선택 장소 좌표들)의 중심점 기준 가까운 순 정렬. 좌표가 없는 장소는 맨 뒤로
   * 보내되 원래 순서를 유지하고, anchors가 비면 정렬 없이 그대로 반환한다.
   */
  private sortByDistanceToAnchors(
    infos: ScheduledPlaceInfo[],
    anchors: Array<{ lat: number; lng: number }>,
  ): ScheduledPlaceInfo[] {
    if (anchors.length === 0) {
      return infos;
    }
    const centerLat = anchors.reduce((sum, a) => sum + a.lat, 0) / anchors.length;
    const centerLng = anchors.reduce((sum, a) => sum + a.lng, 0) / anchors.length;

    const distance = (info: ScheduledPlaceInfo): number =>
      info.lat !== null && info.lng !== null
        ? haversineKm(centerLat, centerLng, info.lat, info.lng)
        : Number.POSITIVE_INFINITY;

    // Array.prototype.sort는 안정 정렬 — 좌표 없는 장소들(Infinity)끼리는 원래 순서 유지.
    return [...infos].sort((a, b) => distance(a) - distance(b));
  }

  private async toScheduledInfo(place: Place): Promise<ScheduledPlaceInfo | null> {
    if (place.source === PlaceSource.GOOGLE) {
      const details = place.externalId
        ? await this.googlePlacesClient.getPlaceDetails(place.externalId)
        : null;
      if (!details) {
        return null;
      }
      return {
        id: place.id,
        name: details.name,
        address: details.address,
        lat: details.latitude,
        lng: details.longitude,
        categoryCode: null,
        // Google 장소는 분류 정보를 저장하지 않아 관광 항목으로 취급한다.
        category: 'attraction',
        imageUrl: null,
      };
    }

    return {
      id: place.id,
      name: place.name ?? '',
      address: place.address,
      lat: place.latitude ? Number(place.latitude) : null,
      lng: place.longitude ? Number(place.longitude) : null,
      categoryCode: place.categoryCode,
      category: PlacesService.toScheduleCategory(place.contentTypeId, place.categoryCode),
      imageUrl: place.imageUrl,
    };
  }

  /** TourAPI 분류 → 스케줄 카테고리. 음식점(39)은 cat3로 카페를 분리하고 나머지는 관광 항목. */
  private static toScheduleCategory(
    contentTypeId: string | null,
    categoryCode: string | null,
  ): SchedulePlaceCategory {
    if (contentTypeId !== CONTENT_TYPE_RESTAURANT) {
      return 'attraction';
    }
    return categoryCode === CAT3_CAFE ? 'cafe' : 'restaurant';
  }

  /**
   * 장소 상세 탭 전용 조회 — 목록/검색과 달리 매칭된 Google place_id로 리뷰(최대 5개)까지
   * 함께 받아온다. 사용자가 실제로 상세를 열 때만 호출되므로 여기서만 리뷰 비용을 쓴다.
   */
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
      const reviews = await this.safeFetchReviews(details.externalId);
      return { ...this.toGoogleCandidateDto(place.id, details), reviews };
    }

    const popularity = await this.safeMatchGooglePlace(place);
    const reviews = popularity?.externalId
      ? await this.safeFetchReviews(popularity.externalId)
      : [];
    return { ...this.toCandidateDto(place, popularity), reviews };
  }

  /** 리뷰 조회 실패가 상세 화면 전체를 막지 않도록 빈 배열로 폴백한다. */
  private async safeFetchReviews(googlePlaceId: string): Promise<PlaceReviewDto[]> {
    try {
      const reviews = await this.googlePlacesClient.getPlaceReviews(googlePlaceId);
      return reviews.map((r) => this.toReviewDto(r));
    } catch (error) {
      this.logger.warn(`Google 리뷰 조회 실패(placeId=${googlePlaceId}): ${(error as Error).message}`);
      return [];
    }
  }

  private toReviewDto(review: GoogleReview): PlaceReviewDto {
    return {
      authorName: review.authorName,
      rating: review.rating,
      text: review.text,
      relativeTime: review.relativeTime,
      profilePhotoUrl: review.profilePhotoUrl,
    };
  }

  /**
   * TourAPI 항목을 places 테이블에 (source, externalId) 기준 벌크 upsert한다(조회 없음).
   * 항목마다 findOneBy+save를 돌리지 않고 ON CONFLICT 한 번으로 처리한다.
   * 지역 동기화(syncArea)는 적재만 필요하고 반환 행이 필요 없어 이 경량 버전을 쓴다.
   * overview 등 여기서 안 건드리는 컬럼은 ON CONFLICT가 덮어쓰지 않아 기존 값이 보존된다.
   */
  private async upsertPlaceRows(rawItems: TourApiPlaceItem[]): Promise<void> {
    if (rawItems.length === 0) {
      return;
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
      reviews: [],
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
      reviews: [],
    };
  }
}
