# tripandend

A new Flutter project.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.

## 소셜 로그인 로컬 실행 설정

이 값들은 비밀값이 아니라(클라이언트 앱에 원래 내장되는 값) 커밋해도 되지만,
바뀌기 쉬운 값이라 소스에 직접 박아두지 않고 아래처럼 주입한다.

1. **카카오 네이티브 앱 키**: 아래 **세 곳 모두에 같은 값**을 넣어야 한다. 하나라도
   비어 있거나 다르면 로그인 시 `KOE101(invalid_client)` 에러가 난다 — 특히 ③을
   빠뜨리기 쉬운데, `KakaoSdk.init()`에 실제로 전달되는(=카카오 서버가 검사하는)
   값은 ③ 하나뿐이고 ①·②는 리다이렉트 스킴 등록용이라 ③ 없이도 앱은 빌드된다.

   ① `android/local.properties`(gitignore 대상)에 한 줄 추가
   ```
   kakaoNativeAppKey=발급받은_카카오_네이티브_앱_키
   ```
   ② iOS는 빌드 설정 치환이 안 돼서 `ios/Runner/Info.plist`의
   `kakaoREPLACE_WITH_NATIVE_APP_KEY` 부분을 직접 `kakao` + 네이티브 앱 키로 바꿔야 한다.

   ③ `flutter run`/`flutter build` 시 `--dart-define=KAKAO_NATIVE_APP_KEY=...`로 전달
   (아래 2번 명령어에 포함되어 있음). `KakaoSdk.init(nativeAppKey: AppConfig.kakaoNativeAppKey)`
   (`lib/main.dart`)가 이 값을 그대로 카카오 로그인 요청에 쓴다.

2. **백엔드 URL / 구글 서버 클라이언트 ID / 카카오 네이티브 앱 키**: `flutter run`/
   `flutter build` 시 `--dart-define`으로 전달한다.
   ```
   flutter run \
     --dart-define=API_BASE_URL=http://10.0.2.2:3000 \
     --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxxx.apps.googleusercontent.com \
     --dart-define=KAKAO_NATIVE_APP_KEY=①·②와_동일한_카카오_네이티브_앱_키
   ```
   `GOOGLE_SERVER_CLIENT_ID`는 Android용 OAuth 클라이언트가 아니라 **"웹 애플리케이션"
   타입**으로 따로 만든 클라이언트 ID여야 한다(google_sign_in이 idToken을 받으려면
   이게 있어야 함). 백엔드 `.env`의 `GOOGLE_CLIENT_ID`와 반드시 같은 값이어야 한다.
   안드로이드 에뮬레이터에서 로컬 백엔드에 접속할 땐 `localhost` 대신 `10.0.2.2`를 쓴다.

3. `com.google.gms.google-services` 플러그인이 `android/app/build.gradle.kts`에 이미
   적용돼 있는데 `google-services.json`이 아직 없다 — Firebase 프로젝트를 만들어
   `android/app/google-services.json`에 넣기 전까지는 Android 빌드 자체가 안 될 수 있다
   (Phase 11/13, Firebase Storage·푸시 알림 붙일 때 같이 처리될 예정).
