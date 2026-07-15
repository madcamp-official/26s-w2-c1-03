/**
 * "다음엔 여기 어때?" 추천 후보군 — 전국 234개 시군구 전체를 매 요청마다 스코어링하면
 * 콜드 스타트 시 TourAPI 호출이 과도해지므로(§places 성능 개선과 같은 이유), 여행지로
 * 널리 알려진 국내 시군구만 큐레이션한다. areaCode/sigunguCode는 frontend
 * `core/data/area_codes.dart`의 TourAPI areaCode2 데이터와 동일한 값(대조 확인됨).
 *
 * bestSeasons(1~12월)는 그 지역이 특히 좋은 달 — 여행 성수기 상식 수준의 느슨한 힌트로,
 * DestinationsService가 현재 월과 겹치면 약한 가산점을 준다(엄밀한 관광 데이터가 아니라
 * 추천에 계절감을 더하는 보조 신호).
 */
export interface CuratedDestination {
  areaCode: string;
  sigunguCode: string;
  /** "강릉", "부산 해운대구"처럼 화면에 그대로 노출되는 지역명. */
  cityName: string;
  bestSeasons?: number[];
}

export const CURATED_DESTINATIONS: readonly CuratedDestination[] = [
  { areaCode: '32', sigunguCode: '1', cityName: '강릉', bestSeasons: [6, 7, 8] },
  { areaCode: '32', sigunguCode: '5', cityName: '속초', bestSeasons: [7, 8, 12, 1] },
  { areaCode: '32', sigunguCode: '7', cityName: '양양', bestSeasons: [7, 8] },
  { areaCode: '32', sigunguCode: '15', cityName: '평창', bestSeasons: [12, 1, 2] },
  { areaCode: '32', sigunguCode: '13', cityName: '춘천', bestSeasons: [9, 10] },
  { areaCode: '35', sigunguCode: '2', cityName: '경주', bestSeasons: [4, 5, 10] },
  { areaCode: '35', sigunguCode: '23', cityName: '포항', bestSeasons: [1, 7, 8] },
  { areaCode: '35', sigunguCode: '11', cityName: '안동', bestSeasons: [4, 5, 10] },
  { areaCode: '6', sigunguCode: '16', cityName: '부산 해운대구', bestSeasons: [7, 8] },
  { areaCode: '36', sigunguCode: '17', cityName: '통영', bestSeasons: [4, 5, 9, 10] },
  { areaCode: '36', sigunguCode: '1', cityName: '거제', bestSeasons: [7, 8] },
  { areaCode: '36', sigunguCode: '5', cityName: '남해', bestSeasons: [4, 5, 9] },
  { areaCode: '38', sigunguCode: '13', cityName: '여수', bestSeasons: [5, 6, 9, 10] },
  { areaCode: '38', sigunguCode: '11', cityName: '순천', bestSeasons: [4, 10, 11] },
  { areaCode: '38', sigunguCode: '7', cityName: '담양', bestSeasons: [5, 9] },
  { areaCode: '37', sigunguCode: '12', cityName: '전주', bestSeasons: [4, 10, 11] },
  { areaCode: '37', sigunguCode: '2', cityName: '군산', bestSeasons: [4, 10] },
  { areaCode: '39', sigunguCode: '4', cityName: '제주시', bestSeasons: [4, 5, 9, 10] },
  { areaCode: '39', sigunguCode: '3', cityName: '서귀포시', bestSeasons: [4, 5, 9, 10] },
  { areaCode: '34', sigunguCode: '14', cityName: '태안', bestSeasons: [7, 8] },
  { areaCode: '34', sigunguCode: '5', cityName: '보령', bestSeasons: [7, 8] },
];
