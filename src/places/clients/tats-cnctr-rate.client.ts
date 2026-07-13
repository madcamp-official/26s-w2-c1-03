import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business-exception';
import { PlacesErrorCode } from '../exceptions/places-error-code';

export interface FetchConcentrationParams {
  /** 지역(광역시/도) 코드 — TourAPI 지역코드 체계와 동일(둘 다 한국관광공사). */
  areaCd: string;
  /** 시군구 코드 — 이 API에서 필수다(areaCd만으로는 조회 불가). */
  signguCd: string;
  /** 정렬 기준 연월일(yyyymmdd). 응답의 향후 30일 중 이 날짜 행만 골라 맵을 만든다. */
  baseYmd: string;
}

interface TatsCnctrRawItem {
  baseYmd?: string;
  tAtsNm?: string;
  cnctrRate?: string | number;
}

interface TatsCnctrRawResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      // 결과 0건이면 items가 빈 문자열("")로, 1건이면 item이 단일 객체로 오는
      // 한국관광공사 공통 스키마를 그대로 따른다(KorService2와 동일).
      items?: { item?: TatsCnctrRawItem | TatsCnctrRawItem[] } | '';
      totalCount?: number;
    };
  };
}

/** 한 페이지 요청 크기 — 시군구 하나의 (관광지 수 × 30일) 전체를 몇 번의 요청으로 받기 위함. */
const NUM_OF_ROWS = 1000;
/** 방어적 상한 — 시군구당 관광지가 아무리 많아도 이 페이지 수를 넘기면 중단한다. */
const MAX_PAGES = 10;
const DEFAULT_BASE_URL = 'https://apis.data.go.kr/B551011/TatsCnctrRateService';

/** 관광지명 표기 흔들림("간현 관광지" vs "간현관광지")을 흡수해 매칭 키로 쓰기 위한 정규화. */
export function normalizePlaceName(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase();
}

/**
 * 한국관광공사 관광지 집중률 방문자 추이 예측 정보(TatsCnctrRateService/tatsCnctrRatedList).
 * 관광지별로 현재일 기준 향후 30일 방문 집중률(cnctrRate)을 준다. 시군구 단위로 한 번
 * 조회하면 그 지역 관광지가 전부 내려오므로(장소당 호출이 아님), TourAPI 후보를 방문
 * 집중도 순으로 정렬하는 데 쓴다 — Google Places 장소별 매칭(장소당 1회 외부 호출)을
 * 대체해 카테고리 요청 지연을 없앤다. 데이터 갱신주기가 일 1회라 결과는 하루 단위로 캐싱 가능하다.
 */
@Injectable()
export class TatsCnctrRateClient {
  private readonly logger = new Logger(TatsCnctrRateClient.name);
  private readonly baseUrl: string;
  private readonly serviceKey: string;

  constructor(configService: ConfigService) {
    this.baseUrl = configService.get<string>('TOUR_API_BIGDATA_BASE_URL') ?? DEFAULT_BASE_URL;
    // 빅데이터 서비스도 같은 공공데이터포털 계정 인증키를 쓴다(서비스만 다르게 구독).
    this.serviceKey = configService.getOrThrow<string>('TOUR_API_SERVICE_KEY');
  }

  /**
   * 시군구의 관광지 집중률을 조회해 `정규화(관광지명) → 해당 baseYmd 집중률` 맵을 만든다.
   * 관광지×30일 전체를 페이지로 받아 목표 날짜(baseYmd) 행만 추린다. 실패는 던지고,
   * 호출부(PlacesService)에서 후보 조회를 막지 않도록 삼킨다.
   */
  async fetchConcentrationMap(params: FetchConcentrationParams): Promise<Map<string, number>> {
    const rateByName = new Map<string, number>();

    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
      const url = this.buildUrl(params, pageNo);
      const body = await this.request(url);

      const resultCode = body.response?.header?.resultCode;
      if (resultCode !== '0000') {
        this.logger.warn(
          `집중률 응답 오류: resultCode=${resultCode} msg=${body.response?.header?.resultMsg}`,
        );
        throw new BusinessException(PlacesErrorCode.TOUR_API_REQUEST_FAILED);
      }

      const items = body.response?.body?.items;
      // 0건이면 items가 빈 문자열(falsy)이라 여기서 걸러진다.
      const rawItemOrItems = items ? items.item : undefined;
      if (!rawItemOrItems) {
        break;
      }
      const rawItems = Array.isArray(rawItemOrItems) ? rawItemOrItems : [rawItemOrItems];

      for (const item of rawItems) {
        if (item.baseYmd !== params.baseYmd || !item.tAtsNm) {
          continue;
        }
        const rate = Number(item.cnctrRate);
        if (!Number.isNaN(rate)) {
          rateByName.set(normalizePlaceName(item.tAtsNm), rate);
        }
      }

      const totalCount = body.response?.body?.totalCount ?? 0;
      if (pageNo * NUM_OF_ROWS >= totalCount) {
        break;
      }
    }

    return rateByName;
  }

  private buildUrl(params: FetchConcentrationParams, pageNo: number): URL {
    const url = new URL(`${this.baseUrl}/tatsCnctrRatedList`);
    url.searchParams.set('serviceKey', this.serviceKey);
    url.searchParams.set('MobileOS', 'ETC');
    url.searchParams.set('MobileApp', 'TripAndEnd');
    url.searchParams.set('_type', 'json');
    url.searchParams.set('areaCd', params.areaCd);
    url.searchParams.set('signguCd', params.signguCd);
    // tAtsNm은 옵션 — 생략하면 해당 시군구의 관광지가 전부 내려온다(장소당 호출 방지).
    url.searchParams.set('numOfRows', String(NUM_OF_ROWS));
    url.searchParams.set('pageNo', String(pageNo));
    return url;
  }

  private async request(url: URL): Promise<TatsCnctrRawResponse> {
    let response: globalThis.Response;
    try {
      response = await fetch(url);
    } catch (error) {
      this.logger.warn(`집중률 요청 네트워크 오류: ${(error as Error).message}`);
      throw new BusinessException(PlacesErrorCode.TOUR_API_REQUEST_FAILED);
    }

    if (!response.ok) {
      this.logger.warn(`집중률 요청 실패: status=${response.status}`);
      throw new BusinessException(PlacesErrorCode.TOUR_API_REQUEST_FAILED);
    }

    return (await response.json()) as TatsCnctrRawResponse;
  }
}
