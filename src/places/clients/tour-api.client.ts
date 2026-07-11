import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business-exception';
import { PlacesErrorCode } from '../exceptions/places-error-code';

export interface TourApiPlaceItem {
  contentId: string;
  contentTypeId: string;
  title: string;
  addr1: string | null;
  addr2: string | null;
  areaCode: string | null;
  sigunguCode: string | null;
  /** 경도(longitude) — TourAPI 필드명이 mapX다. */
  mapX: string | null;
  /** 위도(latitude) — TourAPI 필드명이 mapY다. */
  mapY: string | null;
  cat1: string | null;
  cat2: string | null;
  cat3: string | null;
  tel: string | null;
  firstImage: string | null;
}

export interface FetchAreaBasedListParams {
  areaCode: string;
  sigunguCode?: string;
  /** 관광지(12)/음식점(39)/쇼핑(38) 등 — 생략하면 필터 없이 전체 조회. */
  contentTypeId?: string;
  numOfRows?: number;
}

interface TourApiRawItem {
  contentid: string;
  contenttypeid: string;
  title: string;
  addr1?: string;
  addr2?: string;
  areacode?: string;
  sigungucode?: string;
  mapx?: string;
  mapy?: string;
  cat1?: string;
  cat2?: string;
  cat3?: string;
  tel?: string;
  firstimage?: string;
}

interface TourApiRawResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      // 결과가 0건이면 TourAPI가 items를 빈 문자열("")로 내려주기도 하고,
      // 1건이면 item이 배열이 아니라 단일 객체로 내려온다 — 둘 다 방어적으로 처리한다.
      items?: { item?: TourApiRawItem | TourApiRawItem[] } | '';
    };
  };
}

const DEFAULT_NUM_OF_ROWS = 30;

/** TourAPI(한국관광공사 KorService2) — 국내 지역코드만 지원한다(§areaCode2로 확인 완료). */
@Injectable()
export class TourApiClient {
  private readonly logger = new Logger(TourApiClient.name);
  private readonly baseUrl: string;
  private readonly serviceKey: string;

  constructor(configService: ConfigService) {
    this.baseUrl = configService.getOrThrow<string>('TOUR_API_BASE_URL');
    this.serviceKey = configService.getOrThrow<string>('TOUR_API_SERVICE_KEY');
  }

  async fetchAreaBasedList(params: FetchAreaBasedListParams): Promise<TourApiPlaceItem[]> {
    const url = new URL(`${this.baseUrl}/areaBasedList2`);
    url.searchParams.set('serviceKey', this.serviceKey);
    url.searchParams.set('MobileOS', 'ETC');
    url.searchParams.set('MobileApp', 'TripAndEnd');
    url.searchParams.set('_type', 'json');
    url.searchParams.set('areaCode', params.areaCode);
    if (params.sigunguCode) {
      url.searchParams.set('sigunguCode', params.sigunguCode);
    }
    if (params.contentTypeId) {
      url.searchParams.set('contentTypeId', params.contentTypeId);
    }
    url.searchParams.set('numOfRows', String(params.numOfRows ?? DEFAULT_NUM_OF_ROWS));
    url.searchParams.set('pageNo', '1');
    // TourAPI에는 진짜 "인기순" 정렬 옵션이 없다 — 인기순은 Google Places 평점/리뷰수로
    // 이 클라이언트 바깥(PlacesService)에서 별도로 계산한다. 여기선 수정일순으로만 받는다.
    url.searchParams.set('arrange', 'C');

    let response: globalThis.Response;
    try {
      response = await fetch(url);
    } catch (error) {
      this.logger.warn(`TourAPI 요청 네트워크 오류: ${(error as Error).message}`);
      throw new BusinessException(PlacesErrorCode.TOUR_API_REQUEST_FAILED);
    }

    if (!response.ok) {
      this.logger.warn(`TourAPI 요청 실패: status=${response.status}`);
      throw new BusinessException(PlacesErrorCode.TOUR_API_REQUEST_FAILED);
    }

    const body = (await response.json()) as TourApiRawResponse;
    const resultCode = body.response?.header?.resultCode;
    if (resultCode !== '0000') {
      this.logger.warn(
        `TourAPI 응답 오류: resultCode=${resultCode} msg=${body.response?.header?.resultMsg}`,
      );
      throw new BusinessException(PlacesErrorCode.TOUR_API_REQUEST_FAILED);
    }

    const items = body.response?.body?.items;
    if (!items) {
      return [];
    }
    const rawItemOrItems = items.item;
    if (!rawItemOrItems) {
      return [];
    }
    const rawItems = Array.isArray(rawItemOrItems) ? rawItemOrItems : [rawItemOrItems];

    return rawItems.map((item) => ({
      contentId: item.contentid,
      contentTypeId: item.contenttypeid,
      title: item.title,
      addr1: item.addr1 || null,
      addr2: item.addr2 || null,
      areaCode: item.areacode || null,
      sigunguCode: item.sigungucode || null,
      mapX: item.mapx || null,
      mapY: item.mapy || null,
      cat1: item.cat1 || null,
      cat2: item.cat2 || null,
      cat3: item.cat3 || null,
      tel: item.tel || null,
      firstImage: item.firstimage || null,
    }));
  }
}
