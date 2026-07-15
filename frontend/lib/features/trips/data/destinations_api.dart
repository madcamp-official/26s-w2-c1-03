import '../../../core/network/api_client.dart';
import 'destination_models.dart';

/// 홈 화면 "다음엔 여기 어때?" 추천 — 신규 기능(plan.md 원 계획에는 없던 API).
class DestinationsApi {
  DestinationsApi(this._apiClient);

  final ApiClient _apiClient;

  Future<List<DestinationRecommendation>> getRecommendations() async {
    final response = await _apiClient.dio.get<Map<String, dynamic>>('/destinations/recommendations');
    final items = response.data!['items'] as List<dynamic>;
    return items
        .map((e) => DestinationRecommendation.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<DestinationDetail> getDetail(String areaCode, String sigunguCode) async {
    final response = await _apiClient.dio.get<Map<String, dynamic>>(
      '/destinations/$areaCode/$sigunguCode',
    );
    return DestinationDetail.fromJson(response.data!);
  }
}
