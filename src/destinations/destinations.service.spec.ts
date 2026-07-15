import { AreaAttraction, AreaHighlight } from '../places/places.service';
import { DestinationsService } from './destinations.service';

describe('DestinationsService', () => {
  let placesService: {
    getAreaHighlight: jest.Mock<Promise<AreaHighlight>, [string, string]>;
    getAreaAttractions: jest.Mock<Promise<AreaAttraction[]>, [string, string, number?]>;
  };
  let tripsService: { findVisitedAreaKeys: jest.Mock<Promise<Set<string>>, [string]> };
  let service: DestinationsService;

  beforeEach(() => {
    placesService = {
      // 기본값: 모든 지역이 score=0, 이미지 없음 — 테스트별로 필요한 지역만 override.
      getAreaHighlight: jest.fn().mockResolvedValue({ score: 0, imageUrl: null }),
      getAreaAttractions: jest.fn().mockResolvedValue([]),
    };
    tripsService = { findVisitedAreaKeys: jest.fn().mockResolvedValue(new Set<string>()) };
    service = new DestinationsService(placesService as never, tripsService as never);
  });

  describe('getRecommendations', () => {
    it('집중률 점수가 높은 지역을 위로 정렬해 반환한다', async () => {
      placesService.getAreaHighlight.mockImplementation(async (areaCode, sigunguCode) => {
        // 강릉(32/1)만 높은 점수, 나머지는 0.
        if (areaCode === '32' && sigunguCode === '1') {
          return { score: 90, imageUrl: 'gangneung.jpg' };
        }
        return { score: 0, imageUrl: null };
      });

      const result = await service.getRecommendations('user-1');

      expect(result[0]).toMatchObject({ cityName: '강릉', imageUrl: 'gangneung.jpg' });
    });

    it('최상위 1건만 AI 추천 태그를 붙인다', async () => {
      const result = await service.getRecommendations('user-1');

      expect(result[0].tag).toBe('AI 추천');
      expect(result.slice(1).every((r) => r.tag === null)).toBe(true);
    });

    it('추천 개수를 6개로 제한한다', async () => {
      const result = await service.getRecommendations('user-1');
      expect(result.length).toBeLessThanOrEqual(6);
    });

    it('이미 방문(계획)한 지역은 추천에서 제외한다', async () => {
      placesService.getAreaHighlight.mockImplementation(async (areaCode, sigunguCode) => {
        if (areaCode === '32' && sigunguCode === '1') {
          return { score: 99, imageUrl: null }; // 강릉이 가장 점수 높지만
        }
        return { score: 0, imageUrl: null };
      });
      // 강릉을 이미 방문 처리
      tripsService.findVisitedAreaKeys.mockResolvedValue(new Set(['32:1']));

      const result = await service.getRecommendations('user-1');

      expect(result.some((r) => r.cityName === '강릉')).toBe(false);
    });

    it('큐레이션 후보 전체를 방문했으면(예외 케이스) 방문 여부 무시하고 그대로 반환한다', async () => {
      // 큐레이션 후보 areaCode:sigunguCode를 전부 방문 처리 — 실제로는 20개 넘게 넣어야
      // 하지만 서비스는 "unvisited가 비면 전체 pool 사용"이므로 극단적으로 전부 방문 처리해도
      // 빈 배열이 아니라 여전히 추천이 나와야 한다.
      const allKeys = new Set([
        '32:1', '32:5', '32:7', '32:15', '32:13', '35:2', '35:23', '35:11', '6:16',
        '36:17', '36:1', '36:5', '38:13', '38:11', '38:7', '37:12', '37:2', '39:4',
        '39:3', '34:14', '34:5',
      ]);
      tripsService.findVisitedAreaKeys.mockResolvedValue(allKeys);

      const result = await service.getRecommendations('user-1');

      expect(result.length).toBeGreaterThan(0);
    });

    it('점수 계산이 실패한 지역은 score=0으로 폴백하고 전체 추천을 막지 않는다', async () => {
      placesService.getAreaHighlight.mockRejectedValueOnce(new Error('boom'));

      const result = await service.getRecommendations('user-1');

      expect(result.length).toBeGreaterThan(0);
    });

    it('점수 캐시가 신선하면 재요청 시 PlacesService를 다시 호출하지 않는다', async () => {
      await service.getRecommendations('user-1');
      const callsAfterFirst = placesService.getAreaHighlight.mock.calls.length;

      await service.getRecommendations('user-2');

      expect(placesService.getAreaHighlight.mock.calls.length).toBe(callsAfterFirst);
    });

    it('사용자마다 방문 지역 조회는 매번 새로 한다(개인화는 캐시하지 않음)', async () => {
      await service.getRecommendations('user-1');
      await service.getRecommendations('user-2');

      expect(tripsService.findVisitedAreaKeys).toHaveBeenCalledWith('user-1');
      expect(tripsService.findVisitedAreaKeys).toHaveBeenCalledWith('user-2');
    });
  });

  describe('getDestinationDetail', () => {
    it('큐레이션 후보에 없는 areaCode/sigunguCode면 DESTINATION_NOT_FOUND를 던진다', async () => {
      await expect(service.getDestinationDetail('999', '999')).rejects.toMatchObject({
        code: 'DESTINATION_NOT_FOUND',
      });
    });

    it('큐레이션 후보면 대표 관광지 목록과 함께 상세를 반환한다', async () => {
      placesService.getAreaAttractions.mockResolvedValue([
        { name: '경포대', imageUrl: 'gyeongpo.jpg', overview: '동해 바다 뷰' },
      ]);

      const result = await service.getDestinationDetail('32', '1');

      expect(result.cityName).toBe('강릉');
      expect(result.attractions).toEqual([
        { name: '경포대', imageUrl: 'gyeongpo.jpg', overview: '동해 바다 뷰' },
      ]);
      expect(placesService.getAreaAttractions).toHaveBeenCalledWith('32', '1', 6);
    });
  });
});
