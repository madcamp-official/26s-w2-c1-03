/// 카카오/구글 SDK 호출 결과를 공통 형태로 정규화한다. 두 SDK의 취소/실패 예외
/// 종류가 서로 다르므로, AuthController는 이 타입만 알면 되게 한다.
sealed class ProviderTokenResult {
  const ProviderTokenResult();
}

class ProviderTokenSuccess extends ProviderTokenResult {
  const ProviderTokenSuccess(this.token);
  final String token;
}

/// 사용자가 로그인 화면에서 완료 전에 취소함. API 명세서의 USER_CANCELLED는
/// 원래 서버가 알 수 없는 클라이언트 전용 상태라, 여기서 바로 흡수하고
/// 백엔드에는 요청 자체를 보내지 않는다.
class ProviderTokenCancelled extends ProviderTokenResult {
  const ProviderTokenCancelled();
}

class ProviderTokenFailure extends ProviderTokenResult {
  const ProviderTokenFailure(this.message);
  final String message;
}
