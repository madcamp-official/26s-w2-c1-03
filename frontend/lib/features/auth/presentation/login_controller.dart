import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/storage/token_storage.dart';
import '../data/auth_api.dart';
import '../google_login_service.dart';
import '../kakao_login_service.dart';
import '../provider_token_result.dart';
import 'auth_state.dart';

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage());

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(tokenStorage: ref.watch(tokenStorageProvider));
});

final authApiProvider = Provider<AuthApi>((ref) => AuthApi(ref.watch(apiClientProvider)));

final kakaoLoginServiceProvider = Provider<KakaoLoginService>((ref) => KakaoLoginService());

final googleLoginServiceProvider = Provider<GoogleLoginService>((ref) => GoogleLoginService());

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>((ref) {
  return AuthController(
    authApi: ref.watch(authApiProvider),
    tokenStorage: ref.watch(tokenStorageProvider),
    kakaoLoginService: ref.watch(kakaoLoginServiceProvider),
    googleLoginService: ref.watch(googleLoginServiceProvider),
  );
});

/// 소셜 SDK 호출 → 백엔드 로그인/토큰 저장 → 상태 전이까지 오케스트레이션한다.
class AuthController extends StateNotifier<AuthState> {
  AuthController({
    required AuthApi authApi,
    required TokenStorage tokenStorage,
    required KakaoLoginService kakaoLoginService,
    required GoogleLoginService googleLoginService,
  }) : _authApi = authApi,
       _tokenStorage = tokenStorage,
       _kakaoLoginService = kakaoLoginService,
       _googleLoginService = googleLoginService,
       super(const AuthUnauthenticated());

  final AuthApi _authApi;
  final TokenStorage _tokenStorage;
  final KakaoLoginService _kakaoLoginService;
  final GoogleLoginService _googleLoginService;

  Future<void> loginWithKakao() => _login(provider: 'kakao', getToken: _kakaoLoginService.signIn);

  Future<void> loginWithGoogle() =>
      _login(provider: 'google', getToken: _googleLoginService.signIn);

  Future<void> _login({
    required String provider,
    required Future<ProviderTokenResult> Function() getToken,
  }) async {
    state = const AuthAuthenticating();

    final tokenResult = await getToken();
    switch (tokenResult) {
      case ProviderTokenCancelled():
        state = const AuthUnauthenticated();
        break;
      case ProviderTokenFailure(:final message):
        state = AuthFailed('PROVIDER_ERROR', message);
        break;
      case ProviderTokenSuccess(:final token):
        try {
          final result = await _authApi.loginWithProvider(provider: provider, idToken: token);
          await _tokenStorage.saveTokens(
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
          );
          state = AuthAuthenticated(result.user, isNewUser: result.isNewUser);
        } on DioException catch (e) {
          state = _toFailedState(e);
        }
        break;
    }
  }

  Future<void> logout() async {
    final refreshToken = await _tokenStorage.readRefreshToken();
    if (refreshToken != null) {
      try {
        await _authApi.logout(refreshToken);
      } on DioException {
        // 서버 호출이 실패해도 로컬 토큰은 지운다 — 로그아웃은 사용자 입장에서 항상 성공해야 한다.
      }
    }
    await Future.wait([_kakaoLoginService.signOut(), _googleLoginService.signOut()]);
    await _tokenStorage.clear();
    state = const AuthUnauthenticated();
  }

  AuthState _toFailedState(DioException e) {
    final error = e.error;
    if (error is ApiException) {
      return AuthFailed(error.code, error.message);
    }
    return const AuthFailed('NETWORK_ERROR', '네트워크 연결을 확인해주세요.');
  }
}
