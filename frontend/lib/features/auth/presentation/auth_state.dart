import '../data/auth_models.dart';

sealed class AuthState {
  const AuthState();
}

class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated();
}

class AuthAuthenticating extends AuthState {
  const AuthAuthenticating();
}

class AuthAuthenticated extends AuthState {
  const AuthAuthenticated(this.user, {required this.isNewUser});
  final AuthUser user;

  /// 로그인 응답의 isNewUser 그대로 — 최초 로그인이면 로그인 화면에서 온보딩
  /// 닉네임 화면으로 보내야 한다(features/profile/presentation/onboarding_nickname_screen.dart).
  final bool isNewUser;
}

/// USER_CANCELLED는 여기 오지 않는다 — provider_token_result 단계에서 이미
/// AuthUnauthenticated로 흡수된다. 이 상태는 실제 실패(네트워크/토큰/서버)만 담는다.
class AuthFailed extends AuthState {
  const AuthFailed(this.code, this.message);
  final String code;
  final String message;
}
