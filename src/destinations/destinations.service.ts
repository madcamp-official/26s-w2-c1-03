import { Injectable, Logger } from '@nestjs/common';
import { BusinessException } from '../common/exceptions/business-exception';
import { PlacesService } from '../places/places.service';
import { TripsService } from '../trips/trips.service';
import { CURATED_DESTINATIONS, CuratedDestination } from './curated-destinations.data';
import { DestinationsErrorCode } from './exceptions/destinations-error-code';

export interface DestinationRecommendation {
  areaCode: string;
  sigunguCode: string;
  cityName: string;
  /** 카드 소제목 — 점수대에 따라 결정되는 짧은 문구(도시별 하드코딩 아님). */
  subtitle: string;
  /** 최상위 1건만 "AI 추천" — 여러 장에 남발하지 않는다(design.md §8 안티패턴 7번). */
  tag: 'AI 추천' | null;
  imageUrl: string | null;
}

export interface DestinationAttraction {
  name: string;
  imageUrl: string | null;
  overview: string | null;
}

/** 여행지 상세 화면(추천 카드를 탭했을 때)이 필요로 하는 전체 정보. */
export interface DestinationDetail {
  areaCode: string;
  sigunguCode: string;
  cityName: string;
  subtitle: string;
  imageUrl: string | null;
  attractions: DestinationAttraction[];
}

interface ScoredDestination {
  destination: CuratedDestination;
  score: number;
  imageUrl: string | null;
}

const RECOMMENDATION_COUNT = 6;
/** 계절 힌트(bestSeasons)와 현재 월이 겹치면 주는 가산점 — 집중률(0~100)에 비하면 보조 신호. */
const SEASONAL_BONUS = 20;
/** 날짜 기반 회전 폭 — 매일 조금씩 순서가 바뀌도록 하는 타이브레이커(0~14). */
const DAILY_JITTER_RANGE = 15;

/** 점수대별 소제목 — 실측 데이터(집중률) 기반이라 도시마다 문구를 따로 관리하지 않는다. */
function subtitleFor(score: number): string {
  if (score >= 60) return '요즘 인기가 많아지고 있어';
  if (score >= 30) return '슬슬 붐비기 시작했어';
  return '아직 한적할 때 다녀와봐';
}

/**
 * 문자열을 결정적인 0~(range-1) 정수로 해시한다(암호학적 용도 아님, 단순 회전용).
 * 같은 입력(도시+날짜)이면 하루 동안 항상 같은 값을 내 배치 캐시와 무관하게 재현 가능하다.
 */
function stableHash(input: string, range: number): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash % range;
}

/**
 * 홈 화면 "다음엔 여기 어때?" 추천(plan.md에는 없던 신규 기능, 2026-07-15 추가).
 * 알고리즘: 큐레이션된 인기 국내 시군구(§curated-destinations.data)를 대상으로
 *   1) 오늘 기준 관광지 집중률 평균(TourAPI, 이미 캐싱된 공공데이터) — 핵심 인기 신호
 *   2) 계절 적합도(bestSeasons 겹치면 가산점) — 도메인 지식 기반 보조 신호
 *   3) 날짜 기반 타이브레이커 — 매일 살짝 순서가 바뀌어 항상 같은 카드만 뜨지 않게 함
 * 로 점수를 매기고, 이미 계획/방문한 지역(TripsService.findVisitedAreaKeys)은 제외한 뒤
 * 상위 N개를 반환한다. 순수 ML/개인 취향 학습은 아니지만, 실제 공공데이터 인기 신호 +
 * 사용자별 미방문 필터링을 결합한 규칙 기반 추천이다.
 *
 * 점수 계산(1·2·3) 자체는 사용자와 무관해 전역으로 한 번만 계산해 캐싱한다(TTL 6시간) —
 * 방문 지역 제외만 요청마다 사용자별로 적용한다. 이렇게 하면 places 성능 개선과 같은
 * 이유로, 트래픽이 몰려도 지역당 TourAPI/집중률 조회가 캐시 주기당 1회로 제한된다.
 */
@Injectable()
export class DestinationsService {
  private readonly logger = new Logger(DestinationsService.name);

  private cachedScored: { value: ScoredDestination[]; expiresAt: number } | null = null;
  private static readonly SCORE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

  constructor(
    private readonly placesService: PlacesService,
    private readonly tripsService: TripsService,
  ) {}

  async getRecommendations(userId: string): Promise<DestinationRecommendation[]> {
    const [scored, visited] = await Promise.all([
      this.getScoredDestinations(),
      this.tripsService.findVisitedAreaKeys(userId),
    ]);

    const unvisited = scored.filter(
      (s) => !visited.has(`${s.destination.areaCode}:${s.destination.sigunguCode}`),
    );
    // 큐레이션 후보 전체를 이미 방문했으면(현실적으로 드묾) 방문 여부와 무관하게 보여준다 —
    // 빈 섹션보다는 재방문 추천이 낫다.
    const pool = unvisited.length > 0 ? unvisited : scored;

    return pool.slice(0, RECOMMENDATION_COUNT).map((s, index) => ({
      areaCode: s.destination.areaCode,
      sigunguCode: s.destination.sigunguCode,
      cityName: s.destination.cityName,
      subtitle: subtitleFor(s.score),
      tag: index === 0 ? 'AI 추천' : null,
      imageUrl: s.imageUrl,
    }));
  }

  /** 전역 점수 캐시 — TTL 내면 재사용, 만료됐으면 전체 후보를 다시 스코어링한다. */
  private async getScoredDestinations(): Promise<ScoredDestination[]> {
    if (this.cachedScored && this.cachedScored.expiresAt > Date.now()) {
      return this.cachedScored.value;
    }

    const scored = await this.scoreAllDestinations();
    scored.sort((a, b) => b.score - a.score);
    this.cachedScored = { value: scored, expiresAt: Date.now() + DestinationsService.SCORE_CACHE_TTL_MS };
    return scored;
  }

  private async scoreAllDestinations(): Promise<ScoredDestination[]> {
    const todayKey = new Date().toISOString().slice(0, 10);
    const currentMonth = new Date().getMonth() + 1;

    return Promise.all(
      CURATED_DESTINATIONS.map(async (destination) => {
        const highlight = await this.placesService
          .getAreaHighlight(destination.areaCode, destination.sigunguCode)
          .catch((error) => {
            this.logger.warn(
              `추천 후보 하이라이트 조회 실패(${destination.cityName}): ${(error as Error).message}`,
            );
            return { score: 0, imageUrl: null };
          });

        const seasonalBonus = destination.bestSeasons?.includes(currentMonth) ? SEASONAL_BONUS : 0;
        const jitter = stableHash(`${destination.cityName}:${todayKey}`, DAILY_JITTER_RANGE);

        return {
          destination,
          score: highlight.score + seasonalBonus + jitter,
          imageUrl: highlight.imageUrl,
        };
      }),
    );
  }

  /**
   * 추천 카드를 탭했을 때 보여줄 여행지 상세 — 대표 이미지/소제목은 추천 목록과 같은
   * 점수 캐시를 재사용하고, 대표 관광지 목록만 이 시점에 추가로 조회한다(상세를 실제로
   * 열어본 지역에만 비용을 쓴다). areaCode/sigunguCode는 큐레이션 후보에 없으면
   * (프론트가 추천 카드로만 진입시키므로 정상 경로에선 발생하지 않음) 404로 거부한다.
   */
  async getDestinationDetail(areaCode: string, sigunguCode: string): Promise<DestinationDetail> {
    const destination = CURATED_DESTINATIONS.find(
      (d) => d.areaCode === areaCode && d.sigunguCode === sigunguCode,
    );
    if (!destination) {
      throw new BusinessException(DestinationsErrorCode.DESTINATION_NOT_FOUND);
    }

    const scored = await this.getScoredDestinations();
    const cached = scored.find(
      (s) => s.destination.areaCode === areaCode && s.destination.sigunguCode === sigunguCode,
    );

    const attractions = await this.placesService.getAreaAttractions(areaCode, sigunguCode, 6);

    return {
      areaCode,
      sigunguCode,
      cityName: destination.cityName,
      subtitle: subtitleFor(cached?.score ?? 0),
      imageUrl: cached?.imageUrl ?? null,
      attractions,
    };
  }
}
