import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../auth/presentation/login_controller.dart' show apiClientProvider;
import 'places_models.dart';

/// API 명세서 §2.2: GET /trips/{tripId}/places/candidates, GET /places/{placeId}.
class PlacesApi {
  PlacesApi(this._apiClient);

  final ApiClient _apiClient;

  /// [category]는 'tourist_spot' | 'restaurant' | 'shopping' 중 하나(null이면 전체,
  /// main/src/places/dto/list-candidates-query.dto.ts PLACE_CATEGORIES와 동일).
  Future<List<PlaceCandidate>> getCandidates(String tripId, {String? category}) async {
    final response = await _apiClient.dio.get<Map<String, dynamic>>(
      '/trips/$tripId/places/candidates',
      queryParameters: {if (category != null) 'category': category},
    );
    final candidates = response.data!['candidates'] as List<dynamic>;
    return candidates
        .map((e) => PlaceCandidate.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 키워드 검색(GET /trips/{tripId}/places/search). 후보 목록에 없는 장소도 찾는다.
  /// 트립에 areaCode가 있으면 그 지역, 없으면 전국에서 검색된다(백엔드 처리).
  Future<List<PlaceCandidate>> searchCandidates(String tripId, String keyword) async {
    final response = await _apiClient.dio.get<Map<String, dynamic>>(
      '/trips/$tripId/places/search',
      queryParameters: {'keyword': keyword},
    );
    final candidates = response.data!['candidates'] as List<dynamic>;
    return candidates
        .map((e) => PlaceCandidate.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<PlaceCandidate> getDetail(String placeId) async {
    final response = await _apiClient.dio.get<Map<String, dynamic>>('/places/$placeId');
    return PlaceCandidate.fromJson(response.data!);
  }
}

final placesApiProvider = Provider<PlacesApi>(
  (ref) => PlacesApi(ref.watch(apiClientProvider)),
);
