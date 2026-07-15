import '../data/destination_models.dart';

sealed class DestinationRecommendationsState {
  const DestinationRecommendationsState();
}

class DestinationRecommendationsLoading extends DestinationRecommendationsState {
  const DestinationRecommendationsLoading();
}

class DestinationRecommendationsLoaded extends DestinationRecommendationsState {
  const DestinationRecommendationsLoaded(this.items);
  final List<DestinationRecommendation> items;
}

/// 추천 API 실패는 홈 화면 전체를 막을 이유가 없는 부가 기능이라, 실패 시에도
/// 섹션 자체를 조용히 숨긴다(별도 에러 배너/재시도 버튼 없음) — 이 상태로 표현한다.
class DestinationRecommendationsFailed extends DestinationRecommendationsState {
  const DestinationRecommendationsFailed();
}
