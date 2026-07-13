import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../auth/presentation/login_controller.dart' show apiClientProvider;
import 'schedule_models.dart';

/// API 명세서 §2.3: POST /trips/{tripId}/schedule/generate.
class ScheduleApi {
  ScheduleApi(this._apiClient);

  final ApiClient _apiClient;

  Future<SchedulePlan> generate({
    required String tripId,
    required List<String> selectedPlaceIds,
  }) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/trips/$tripId/schedule/generate',
      data: {'selectedPlaceIds': selectedPlaceIds},
    );
    final schedule = response.data!['schedule'] as Map<String, dynamic>;
    return SchedulePlan.fromJson(schedule);
  }
}

final scheduleApiProvider = Provider<ScheduleApi>(
  (ref) => ScheduleApi(ref.watch(apiClientProvider)),
);
