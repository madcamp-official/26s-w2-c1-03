import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/storage/token_storage.dart';
import '../../notifications/push_notification_service.dart';
import '../../profile/data/users_api.dart';
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

final pushNotificationServiceProvider = Provider<PushNotificationService>(
  (ref) => PushNotificationService(),
);

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>((ref) {
  return AuthController(
    authApi: ref.watch(authApiProvider),
    usersApi: UsersApi(ref.watch(apiClientProvider)),
    tokenStorage: ref.watch(tokenStorageProvider),
    kakaoLoginService: ref.watch(kakaoLoginServiceProvider),
    googleLoginService: ref.watch(googleLoginServiceProvider),
    pushNotificationService: ref.watch(pushNotificationServiceProvider),
  );
});

/// 소셜 SDK 호출 → 백엔드 로그인/토큰 저장 → 상태 전이까지 오케스트레이션한다.
class AuthController extends StateNotifier<AuthState> {
  AuthController({
    required AuthApi authApi,
    required UsersApi usersApi,
    required TokenStorage tokenStorage,
    required KakaoLoginService kakaoLoginService,
    required GoogleLoginService googleLoginService,
    required PushNotificationService pushNotificationService,
  }) : _authApi = authApi,
       _usersApi = usersApi,
       _tokenStorage = tokenStorage,
       _kakaoLoginService = kakaoLoginService,
       _googleLoginService = googleLoginService,
       _pushNotificationService = pushNotificationService,
       super(const AuthUnauthenticated());

  final AuthApi _authApi;
  final UsersApi _usersApi;
  final TokenStorage _tokenStorage;
  final KakaoLoginService _kakaoLoginService;
  final GoogleLoginService _googleLoginService;
  final PushNotificationService _pushNotificationService;

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
          // 권한 팝업/FCM 토큰 발급을 기다리면 로그인 흐름이 멈춰 보이므로 기다리지 않는다.
          unawaited(
            _pushNotificationService.syncDevice(usersApi: _usersApi, tokenStorage: _tokenStorage),
          );
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
    await _deactivateDevice();
    await Future.wait([_kakaoLoginService.signOut(), _googleLoginService.signOut()]);
    await _tokenStorage.clear();
    state = const AuthUnauthenticated();
  }

  /// 로그아웃 후에도 서버가 이 기기로 푸시를 계속 보내지 않도록 비활성화한다.
  /// 실패해도 로그아웃 자체는 항상 성공해야 하므로 조용히 무시한다.
  Future<void> _deactivateDevice() async {
    final deviceId = await _tokenStorage.readDeviceId();
    if (deviceId == null) return;
    try {
      await _usersApi.deactivateDevice(deviceId);
    } on DioException {
      // 위 doc 참고.
    }
  }

  AuthState _toFailedState(DioException e) {
    final error = e.error;
    if (error is ApiException) {
      return AuthFailed(error.code, error.message);
    }
    return const AuthFailed('NETWORK_ERROR', '네트워크 연결을 확인해주세요.');
  }
}
