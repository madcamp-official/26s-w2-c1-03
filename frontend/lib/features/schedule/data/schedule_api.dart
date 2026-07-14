import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../auth/presentation/login_controller.dart' show apiClientProvider;
import 'schedule_models.dart';

/// API 명세서 §2.3: POST /trips/{tripId}/schedule/generate.
class ScheduleApi {
  ScheduleApi(this._apiClient);

  final ApiClient _apiClient;

  Future<SchedulePlan> getSchedule(String tripId) async {
    final response = await _apiClient.dio.get<Map<String, dynamic>>(
      '/trips/$tripId/schedule',
    );
    final schedule = response.data!['schedule'] as Map<String, dynamic>;
    return SchedulePlan.fromJson(schedule);
  }

  Future<SchedulePlan> generate({
    required String tripId,
    required List<String> selectedPlaceIds,
  }) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/trips/$tripId/schedule/generate',
      data: {'selectedPlaceIds': selectedPlaceIds},
      options: Options(receiveTimeout: const Duration(seconds: 60)),
    );
    final schedule = response.data!['schedule'] as Map<String, dynamic>;
    return SchedulePlan.fromJson(schedule);
  }

  /// API 명세서 §2.4 POST /schedule/places — placeId 참조 또는 custom 직접입력 추가.
  Future<ScheduledTripPlace> addPlace({
    required String tripId,
    String? placeId,
    String? customName,
    String? customAddress,
    required int dayNumber,
    int? orderInDay,
    String? memo,
  }) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/trips/$tripId/schedule/places',
      data: {
        if (placeId != null) 'placeId': placeId,
        if (customName != null) 'customName': customName,
        if (customAddress != null) 'customAddress': customAddress,
        'dayNumber': dayNumber,
        if (orderInDay != null) 'orderInDay': orderInDay,
        if (memo != null) 'memo': memo,
      },
    );
    return ScheduledTripPlace.fromJson(
      response.data!['tripPlace'] as Map<String, dynamic>,
    );
  }

  /// API 명세서 §2.4 PATCH — 메모 수정 / 개별 위치 이동.
  Future<ScheduledTripPlace> updatePlace({
    required String tripId,
    required String tripPlaceId,
    int? dayNumber,
    int? orderInDay,
    Object? memo = _unset,
  }) async {
    final response = await _apiClient.dio.patch<Map<String, dynamic>>(
      '/trips/$tripId/schedule/places/$tripPlaceId',
      data: {
        if (dayNumber != null) 'dayNumber': dayNumber,
        if (orderInDay != null) 'orderInDay': orderInDay,
        // memo는 null 전송(삭제)과 미전송(변경 없음)을 구분해야 해 sentinel을 쓴다.
        if (!identical(memo, _unset)) 'memo': memo,
      },
    );
    return ScheduledTripPlace.fromJson(
      response.data!['tripPlace'] as Map<String, dynamic>,
    );
  }

  /// API 명세서 §2.4 DELETE — 장소 제거(204).
  Future<void> removePlace({
    required String tripId,
    required String tripPlaceId,
  }) async {
    await _apiClient.dio.delete<void>(
      '/trips/$tripId/schedule/places/$tripPlaceId',
    );
  }

  /// API 명세서 §2.4 PATCH /schedule/reorder — 드래그앤드롭 일괄 순서 변경.
  Future<SchedulePlan> reorder({
    required String tripId,
    required List<ReorderOperation> operations,
  }) async {
    final response = await _apiClient.dio.patch<Map<String, dynamic>>(
      '/trips/$tripId/schedule/reorder',
      data: {'operations': operations.map((op) => op.toJson()).toList()},
    );
    final schedule = response.data!['schedule'] as Map<String, dynamic>;
    return SchedulePlan.fromJson(schedule);
  }

  /// API 명세서 §2.5 POST /schedule/revise — 자연어 프롬프트로 수정 제안(저장 안 함).
  Future<ScheduleProposal> revise({
    required String tripId,
    required String prompt,
  }) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/trips/$tripId/schedule/revise',
      data: {'prompt': prompt},
      options: Options(receiveTimeout: const Duration(seconds: 60)),
    );
    return ScheduleProposal.fromJson(response.data!);
  }

  /// POST /schedule/revise/apply — 유저가 확인한(일부 제외 가능) 항목으로 전체 교체.
  Future<SchedulePlan> applyRevision({
    required String tripId,
    required List<ProposalItem> items,
  }) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/trips/$tripId/schedule/revise/apply',
      data: {'items': items.map((item) => item.toApplyJson()).toList()},
    );
    final schedule = response.data!['schedule'] as Map<String, dynamic>;
    return SchedulePlan.fromJson(schedule);
  }

  /// POST /schedule/chat — 챗봇 스케줄 편집. 대화는 세션 한정이라 [messages]에 그동안의
  /// user/assistant 히스토리 전체를 담아 매번 보낸다. AI가 도구를 호출하면 서버가 그
  /// 자리에서 실제로 반영하므로(응답의 changed로 알 수 있음), 반환된 schedule이 최신 상태다.
  Future<ChatReply> chat({
    required String tripId,
    required List<ChatMessage> messages,
  }) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/trips/$tripId/schedule/chat',
      data: {'messages': messages.map((m) => m.toJson()).toList()},
      options: Options(receiveTimeout: const Duration(seconds: 60)),
    );
    return ChatReply.fromJson(response.data!);
  }

  /// 되돌리기 — snapshot(직전 스케줄 스냅샷)으로 전체를 교체한다. revise/apply 엔드포인트를
  /// 그대로 재사용하되, ScheduledTripPlace를 apply 항목 형태로 직접 변환한다(placeId가
  /// 없으면 name/address를 custom 필드로 취급 — buildView가 커스텀 항목을 그렇게 채운다).
  Future<SchedulePlan> restoreSnapshot({
    required String tripId,
    required SchedulePlan snapshot,
  }) async {
    final items = [
      for (final day in snapshot.days)
        for (final place in day.places)
          ProposalItem(
            placeId: place.placeId,
            customName: place.placeId == null ? place.name : null,
            customAddress: place.placeId == null ? place.address : null,
            dayNumber: place.dayNumber,
            orderInDay: place.orderInDay,
            startTime: place.startTime,
            name: place.name,
            address: place.address,
          ),
    ];
    return applyRevision(tripId: tripId, items: items);
  }
}

/// memo 미전송과 null 전송을 구분하기 위한 sentinel.
const Object _unset = Object();

class ReorderOperation {
  const ReorderOperation({
    required this.tripPlaceId,
    required this.dayNumber,
    required this.orderInDay,
  });

  final String tripPlaceId;
  final int dayNumber;
  final int orderInDay;

  Map<String, dynamic> toJson() => {
    'tripPlaceId': tripPlaceId,
    'dayNumber': dayNumber,
    'orderInDay': orderInDay,
  };
}

final scheduleApiProvider = Provider<ScheduleApi>(
  (ref) => ScheduleApi(ref.watch(apiClientProvider)),
);
