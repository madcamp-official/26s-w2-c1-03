import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business-exception';
import { isNetworkError } from '../../common/utils/network-error.util';
import { PlacesErrorCode } from '../exceptions/places-error-code';

export interface MatchPlaceParams {
  name: string;
  latitude: number;
  longitude: number;
}

export interface PlacePopularity {
  rating: number;
  reviewCount: number;
}

/** 키워드 검색(searchText) 결과 한 건. externalId = Google place id. */
export interface GooglePlaceResult {
  externalId: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewCount: number | null;
}

interface SearchTextResponseBody {
  places?: Array<{ rating?: number; userRatingCount?: number }>;
}

interface SearchTextPlacesResponseBody {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    rating?: number;
    userRatingCount?: number;
  }>;
}

const SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';
const LOCATION_BIAS_RADIUS_METERS = 1500;

/**
 * Google Places API (New) — Text Search. Kakao 로컬 API는 평점/리뷰수를 제공하지
 * 않아(카카오 공식 정책, 대체 불가 확인) 인기순 정렬용 2차 데이터 소스로 채택했다.
 */
@Injectable()
export class GooglePlacesClient {
  private readonly logger = new Logger(GooglePlacesClient.name);
  private readonly apiKey: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.getOrThrow<string>('GOOGLE_PLACES_API_KEY');
  }

  /** 이름+좌표로 가장 근접한 장소를 찾아 평점/리뷰수를 반환한다. 매칭 결과가 없으면 null. */
  async matchPlace(params: MatchPlaceParams): Promise<PlacePopularity | null> {
    let response: globalThis.Response;
    try {
      response = await fetch(SEARCH_TEXT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'places.rating,places.userRatingCount',
        },
        body: JSON.stringify({
          textQuery: params.name,
          languageCode: 'ko',
          locationBias: {
            circle: {
              center: { latitude: params.latitude, longitude: params.longitude },
              radius: LOCATION_BIAS_RADIUS_METERS,
            },
          },
        }),
      });
    } catch (error) {
      if (isNetworkError(error)) {
        throw new BusinessException(PlacesErrorCode.GOOGLE_PLACES_REQUEST_FAILED);
      }
      throw new BusinessException(
        PlacesErrorCode.GOOGLE_PLACES_REQUEST_FAILED,
        error instanceof Error ? error.message : undefined,
      );
    }

    if (!response.ok) {
      this.logger.warn(`Google Places 요청 실패: status=${response.status}`);
      throw new BusinessException(PlacesErrorCode.GOOGLE_PLACES_REQUEST_FAILED);
    }

    const body = (await response.json()) as SearchTextResponseBody;
    const best = body.places?.[0];
    if (!best || best.rating === undefined || best.userRatingCount === undefined) {
      return null;
    }
    return { rating: best.rating, reviewCount: best.userRatingCount };
  }

  /**
   * 키워드로 장소를 검색한다(Text Search). TourAPI searchKeyword2는 한국관광공사에
   * 등록된 콘텐츠만 포함해 정확한 지명·식당·카페가 안 잡히는 경우가 많아, 검색은
   * Google Places로 대체한다. 평점/리뷰수를 같은 응답에서 함께 받아 별도 matchPlace
   * 호출 없이 인기순 정렬에 바로 쓴다(검색 1회 = Google 요청 1회).
   */
  async searchText(keyword: string): Promise<GooglePlaceResult[]> {
    let response: globalThis.Response;
    try {
      response = await fetch(SEARCH_TEXT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount',
        },
        body: JSON.stringify({
          textQuery: keyword,
          languageCode: 'ko',
          regionCode: 'KR',
        }),
      });
    } catch (error) {
      if (isNetworkError(error)) {
        throw new BusinessException(PlacesErrorCode.GOOGLE_PLACES_REQUEST_FAILED);
      }
      throw new BusinessException(
        PlacesErrorCode.GOOGLE_PLACES_REQUEST_FAILED,
        error instanceof Error ? error.message : undefined,
      );
    }

    if (!response.ok) {
      this.logger.warn(`Google Places 검색 실패: status=${response.status}`);
      throw new BusinessException(PlacesErrorCode.GOOGLE_PLACES_REQUEST_FAILED);
    }

    const body = (await response.json()) as SearchTextPlacesResponseBody;
    return (body.places ?? [])
      .map((p) => ({
        externalId: p.id ?? '',
        name: p.displayName?.text ?? '',
        address: p.formattedAddress ?? null,
        latitude: p.location?.latitude ?? null,
        longitude: p.location?.longitude ?? null,
        rating: p.rating ?? null,
        reviewCount: p.userRatingCount ?? null,
      }))
      .filter((p) => p.externalId !== '' && p.name !== '');
  }
}
