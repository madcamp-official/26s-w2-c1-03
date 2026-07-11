import '../../../core/network/api_client.dart';
import 'auth_models.dart';

/// API 명세서 §1: POST /auth/{provider}/login, /auth/token/refresh, /auth/logout.
/// 실패는 여기서 감싸지 않고 DioException(+ApiClient가 붙인 ApiException)을 그대로
/// 올려보낸다 — 에러 코드별 분기는 AuthController가 한 곳에서 처리한다.
class AuthApi {
  AuthApi(this._apiClient);

  final ApiClient _apiClient;

  Future<SocialLoginResult> loginWithProvider({
    required String provider,
    required String idToken,
  }) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/auth/$provider/login',
      data: {'idToken': idToken},
    );
    final body = response.data!;
    return SocialLoginResult(
      tokens: AuthTokens(
        accessToken: body['accessToken'] as String,
        refreshToken: body['refreshToken'] as String,
      ),
      isNewUser: body['isNewUser'] as bool,
      user: AuthUser.fromJson(body['user'] as Map<String, dynamic>),
    );
  }

  Future<AuthTokens> refresh(String refreshToken) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/auth/token/refresh',
      data: {'refreshToken': refreshToken},
    );
    final body = response.data!;
    return AuthTokens(
      accessToken: body['accessToken'] as String,
      refreshToken: body['refreshToken'] as String,
    );
  }

  Future<void> logout(String refreshToken) {
    return _apiClient.dio.post<void>('/auth/logout', data: {'refreshToken': refreshToken});
  }
}
