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

  /// API 명세서 §0 기준 백엔드 base URL. defaultValue는 실제 배포된 백엔드
  /// (cloudflare 터널)라, dart-define 없이 그냥 실행해도 바로 붙는다. 로컬
  /// 백엔드로 개발할 땐 `--dart-define=API_BASE_URL=http://10.0.2.2:3000`
  /// (에뮬레이터에서 호스트 PC는 localhost가 아니라 10.0.2.2)으로 덮어쓴다.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api.tripend.madcamp-kaist.org',
  );

  /// google_sign_in이 idToken을 발급하려면 "웹 애플리케이션" 타입 OAuth 클라이언트
  /// ID가 필요하다(Android 클라이언트 ID와는 다른 별개의 클라이언트). 백엔드
  /// GOOGLE_CLIENT_ID와 정확히 같은 값이어야 서버 쪽 idToken 검증이 통과한다.
  ///
  /// 이 값은 시크릿이 아니라 클라이언트에 공개되는 식별자라(위 클래스 주석 참고),
  /// defaultValue로 박아둔다 — dart-define을 깜빡하고 실행하면 빈 문자열이 돼서
  /// GoogleSignIn이 idToken을 못 받고 "로그인 중 문제" 에러가 난다.
  static const String googleServerClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
    defaultValue: '504131351844-3or38ad183eaedmc2vcgqkrn060p8c85.apps.googleusercontent.com',
  );

  /// 카카오 개발자 콘솔의 "네이티브 앱 키". AndroidManifest.xml/Info.plist의
  /// 리다이렉트 URL 스킴(`kakao{NATIVE_APP_KEY}`)과 반드시 같은 값이어야 하므로,
  /// 이 값을 바꾸면 두 네이티브 설정 파일(및 android/local.properties의
  /// kakaoNativeAppKey)도 함께 갱신해야 한다.
  ///
  /// 위 googleServerClientId와 같은 이유로 defaultValue를 박아둔다 — 빈 값이면
  /// KakaoSdk.init에 빈 앱 키가 들어가 로그인 시 KOE101(잘못된 앱 키)이 뜬다.
  static const String kakaoNativeAppKey = String.fromEnvironment(
    'KAKAO_NATIVE_APP_KEY',
    defaultValue: 'ad103f738ca5b988358a62e5e15c8bed',
  );

  /// Firebase Web은 Android/iOS처럼 google-services.json /
  /// GoogleService-Info.plist를 자동으로 읽지 못한다. 웹에서 Firebase 기능을
  /// 쓰려면 Firebase Console의 Web app 설정값을 --dart-define으로 주입한다.
  static const String firebaseWebApiKey = String.fromEnvironment('FIREBASE_WEB_API_KEY');
  static const String firebaseWebAuthDomain = String.fromEnvironment('FIREBASE_WEB_AUTH_DOMAIN');
  static const String firebaseWebProjectId = String.fromEnvironment('FIREBASE_WEB_PROJECT_ID');
  static const String firebaseWebStorageBucket = String.fromEnvironment('FIREBASE_WEB_STORAGE_BUCKET');
  static const String firebaseWebMessagingSenderId = String.fromEnvironment('FIREBASE_WEB_MESSAGING_SENDER_ID');
  static const String firebaseWebAppId = String.fromEnvironment('FIREBASE_WEB_APP_ID');

  static bool get hasFirebaseWebOptions =>
      firebaseWebApiKey.isNotEmpty &&
      firebaseWebProjectId.isNotEmpty &&
      firebaseWebStorageBucket.isNotEmpty &&
      firebaseWebMessagingSenderId.isNotEmpty &&
      firebaseWebAppId.isNotEmpty;
}
