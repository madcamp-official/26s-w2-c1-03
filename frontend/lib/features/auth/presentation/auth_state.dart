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
  const AuthAuthenticated(this.user);
  final AuthUser user;
}

/// USER_CANCELLED는 여기 오지 않는다 — provider_token_result 단계에서 이미
/// AuthUnauthenticated로 흡수된다. 이 상태는 실제 실패(네트워크/토큰/서버)만 담는다.
class AuthFailed extends AuthState {
  const AuthFailed(this.code, this.message);
  final String code;
  final String message;
}
