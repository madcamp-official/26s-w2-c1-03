/// 빌드 환경별 설정값.
///
/// 여기 값들(백엔드 URL, OAuth 클라이언트 ID, 카카오 네이티브 앱 키)은 애초에
/// 클라이언트 앱에 공개적으로 포함되는 값이라 비밀값이 아니다. REST API 키·
/// client secret 같은 진짜 시크릿은 오직 백엔드 `.env`에만 있고 이 앱에는
/// 절대 넣지 않는다(README 참고).
///
/// 실행 시 `--dart-define`으로 주입한다. 예:
///   flutter run \
///     --dart-define=API_BASE_URL=http://10.0.2.2:3000 \
///     --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxxx.apps.googleusercontent.com \
///     --dart-define=KAKAO_NATIVE_APP_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
class AppConfig {
  AppConfig._();

  /// API 명세서 §0 기준 백엔드 base URL. 안드로이드 에뮬레이터에서는 localhost가
  /// 에뮬레이터 자기 자신을 가리키므로 호스트 PC는 10.0.2.2로 접근해야 한다.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  /// google_sign_in이 idToken을 발급하려면 "웹 애플리케이션" 타입 OAuth 클라이언트
  /// ID가 필요하다(Android 클라이언트 ID와는 다른 별개의 클라이언트). 백엔드
  /// GOOGLE_CLIENT_ID와 정확히 같은 값이어야 서버 쪽 idToken 검증이 통과한다.
  static const String googleServerClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
  );

  /// 카카오 개발자 콘솔의 "네이티브 앱 키". AndroidManifest.xml/Info.plist의
  /// 리다이렉트 URL 스킴(`kakao{NATIVE_APP_KEY}`)과 반드시 같은 값이어야 하므로,
  /// 이 값을 바꾸면 두 네이티브 설정 파일도 함께 갱신해야 한다.
  static const String kakaoNativeAppKey = String.fromEnvironment(
    'KAKAO_NATIVE_APP_KEY',
  );
}
