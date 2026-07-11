import '../../../core/network/api_client.dart';
import '../../auth/data/auth_models.dart';

/// API 명세서 §1: GET/PATCH/DELETE /users/me. GET/PATCH 응답이 로그인 응답의
/// user와 완전히 같은 리소스라 별도 모델을 만들지 않고 auth/data/auth_models.dart의
/// AuthUser를 그대로 재사용한다(이미지 업로드·디바이스 등록은 이번 스코프 아님 — plan.md 참고).
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
}
