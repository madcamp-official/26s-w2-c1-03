import '../../../core/network/api_client.dart';
import '../../auth/data/auth_models.dart';

/// API 명세서 §1 POST /users/me/devices 응답(`DeviceSummary`, src/users/users.service.ts).
class DeviceSummary {
  const DeviceSummary({
    required this.id,
    required this.platform,
    required this.isActive,
    required this.lastActiveAt,
  });

  final String id;
  final String platform;
  final bool isActive;
  final DateTime lastActiveAt;

  factory DeviceSummary.fromJson(Map<String, dynamic> json) => DeviceSummary(
    id: json['id'] as String,
    platform: json['platform'] as String,
    isActive: json['isActive'] as bool,
    lastActiveAt: DateTime.parse(json['lastActiveAt'] as String),
  );
}

/// API 명세서 §1: GET/PATCH/DELETE /users/me, POST/DELETE /users/me/devices.
/// GET/PATCH /users/me 응답이 로그인 응답의 user와 완전히 같은 리소스라 별도
/// 모델을 만들지 않고 auth/data/auth_models.dart의 AuthUser를 그대로 재사용한다.
class UsersApi {
  UsersApi(this._apiClient);

  final ApiClient _apiClient;

  Future<AuthUser> getMe() async {
    final response = await _apiClient.dio.get<Map<String, dynamic>>('/users/me');
    return AuthUser.fromJson(response.data!);
  }

  Future<AuthUser> updateNickname(String nickname) async {
    final response = await _apiClient.dio.patch<Map<String, dynamic>>(
      '/users/me',
      data: {'nickname': nickname},
    );
    return AuthUser.fromJson(response.data!);
  }

  Future<AuthUser> updateProfileImageUrl(String profileImageUrl) async {
    final response = await _apiClient.dio.patch<Map<String, dynamic>>(
      '/users/me',
      data: {'profileImageUrl': profileImageUrl},
    );
    return AuthUser.fromJson(response.data!);
  }

  /// 회원 탈퇴(soft delete: status=withdrawn). 204 응답, 별도 바디 없음.
  Future<void> deleteMe() {
    return _apiClient.dio.delete<void>('/users/me');
  }

  Future<DeviceSummary> registerDevice({required String pushToken, required String platform}) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/users/me/devices',
      data: {'pushToken': pushToken, 'platform': platform},
    );
    return DeviceSummary.fromJson(response.data!);
  }

  /// 204 응답, 별도 바디 없음.
  Future<void> deactivateDevice(String deviceId) {
    return _apiClient.dio.delete<void>('/users/me/devices/$deviceId');
  }
}
