import 'package:google_maps_flutter/google_maps_flutter.dart';

const categoryFilters = <(String? value, String label)>[
  (null, '전체'),
  ('tourist_spot', '관광지'),
  ('restaurant', '맛집'),
  ('cafe', '카페'),
  ('shopping', '쇼핑'),
];

/// 카테고리 값 → TourAPI contentTypeId(백엔드 CATEGORY_TO_CONTENT_TYPE_ID와 동일).
/// 맛집/카페는 TourAPI에 별도 contentTypeId가 없어 둘 다 음식점(39)이다 — 실제
/// 구분은 [placeMatchesCategory]가 categoryCode(cat3)로 한다.
const categoryContentTypeIds = <String, String>{
  'tourist_spot': '12',
  'restaurant': '39',
  'cafe': '39',
  'shopping': '38',
};

/// TourAPI 음식점(39) 소분류 중 카페/전통찻집 cat3 코드(백엔드 CAT3_CAFE와 동일).
const cafeCat3Code = 'A05020900';

/// 전체 후보에서 이미 받은 장소를 카테고리별로 먼저 걸러낼 때 쓴다(카테고리 전용
/// 추가 조회 결과를 합쳐 30곳까지 채운다 — API 명세서 §2.2). 맛집/카페는 contentTypeId가
/// 같아 categoryCode(cat3)로 한 번 더 갈라야 한다.
bool placeMatchesCategory(String? contentTypeId, String? categoryCode, String category) {
  final wanted = categoryContentTypeIds[category];
  if (wanted == null || contentTypeId != wanted) return false;
  if (category == 'restaurant') return categoryCode != cafeCat3Code;
  if (category == 'cafe') return categoryCode == cafeCat3Code;
  return true;
}

const candidatePageSize = 30;

/// 대한민국 중심 대략 좌표(초기 카메라). 후보가 로드되면 그 범위로 다시 맞춘다.
const koreaCenter = CameraPosition(target: LatLng(36.5, 127.8), zoom: 6.5);

/// 목록 행을 눌렀을 때 지도가 그 장소로 확대되는 줌 레벨(축척 확대, 요구사항 3).
const focusZoom = 15.0;
