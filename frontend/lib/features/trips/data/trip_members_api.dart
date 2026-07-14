import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../auth/presentation/login_controller.dart' show apiClientProvider;
import 'trip_member_models.dart';

final tripMembersApiProvider = Provider<TripMembersApi>(
  (ref) => TripMembersApi(ref.watch(apiClientProvider)),
);

/// API 명세서 §3.1: 초대 링크 생성/참여 + 멤버 관리 6개 엔드포인트.
class TripMembersApi {
  TripMembersApi(this._apiClient);

  final ApiClient _apiClient;

  /// owner/editor만 가능. [expiresInHours] 생략 시 무기한 링크.
  Future<InviteLink> createInviteLink(String tripId, {int? expiresInHours}) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/trips/$tripId/invite-links',
      data: {'expiresInHours': ?expiresInHours},
    );
    return InviteLink.fromJson(response.data!);
  }

  /// 초대 토큰으로 참여. 이미 멤버여도 성공(멱등). 반환값은 참여한 tripId.
  Future<String> joinByToken(String token) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/trips/invite-links/$token/join',
    );
    return response.data!['tripId'] as String;
  }

  Future<List<TripMember>> listMembers(String tripId) async {
    final response = await _apiClient.dio.get<Map<String, dynamic>>('/trips/$tripId/members');
    return (response.data!['items'] as List<dynamic>)
        .map((e) => TripMember.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// owner만 가능. 마지막 owner 강등은 서버가 LAST_OWNER_CANNOT_LEAVE(409)로 거부.
  Future<TripMember> updateMemberRole(String tripId, String userId, TripMemberRole role) async {
    final response = await _apiClient.dio.patch<Map<String, dynamic>>(
      '/trips/$tripId/members/$userId',
      data: {'role': role.name},
    );
    return TripMember.fromJson(response.data!);
  }

  /// owner만 가능(멤버 내보내기).
  Future<void> removeMember(String tripId, String userId) {
    return _apiClient.dio.delete<void>('/trips/$tripId/members/$userId');
  }

  /// 자진 탈퇴. 마지막 owner는 서버가 거부한다.
  Future<void> leaveTrip(String tripId) {
    return _apiClient.dio.delete<void>('/trips/$tripId/members/me');
  }
}
