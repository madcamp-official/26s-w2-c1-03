import '../../../core/network/api_client.dart';
import 'trip_models.dart';

/// API 명세서 §2.1: POST/GET/PATCH/DELETE /trips. 목록은 cursor 페이지네이션을
/// 지원하지만 이번 스코프는 첫 페이지만 로드한다(무한 스크롤은 나중 스코프).
class TripsApi {
  TripsApi(this._apiClient);

  final ApiClient _apiClient;

  Future<PaginatedTrips> list() async {
    final response = await _apiClient.dio.get<Map<String, dynamic>>('/trips');
    return PaginatedTrips.fromJson(response.data!);
  }

  Future<Trip> create({
    required String title,
    required String cityName,
    required String startDate,
    required String endDate,
    String? areaCode,
    String? sigunguCode,
  }) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/trips',
      data: {
        'title': title,
        'cityName': cityName,
        'startDate': startDate,
        'endDate': endDate,
        if (areaCode != null) 'areaCode': areaCode,
        if (sigunguCode != null) 'sigunguCode': sigunguCode,
      },
    );
    return Trip.fromJson(response.data!);
  }

  Future<Trip> getDetail(String tripId) async {
    final response = await _apiClient.dio.get<Map<String, dynamic>>('/trips/$tripId');
    return Trip.fromJson(response.data!);
  }

  Future<Trip> update(String tripId, {String? title, String? startDate, String? endDate}) async {
    final response = await _apiClient.dio.patch<Map<String, dynamic>>(
      '/trips/$tripId',
      data: {
        if (title != null) 'title': title,
        if (startDate != null) 'startDate': startDate,
        if (endDate != null) 'endDate': endDate,
      },
    );
    return Trip.fromJson(response.data!);
  }

  Future<void> delete(String tripId) {
    return _apiClient.dio.delete<void>('/trips/$tripId');
  }
}
