import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kakao_flutter_sdk_user/kakao_flutter_sdk_user.dart';
import 'core/config/app_config.dart';
import 'core/deeplink/invite_deep_link_handler.dart';
import 'features/auth/presentation/login_controller.dart';
import 'features/auth/presentation/login_screen.dart';
import 'features/home/presentation/app_shell.dart';
import 'features/profile/data/users_api.dart';
import 'features/trips/presentation/join_trip_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await _initializeFirebase();
  KakaoSdk.init(
    nativeAppKey: AppConfig.kakaoNativeAppKey,
    javaScriptAppKey: AppConfig.kakaoJavaScriptAppKey,
  );
  // 초대 딥링크(plan.md Phase 10). 토큰이 와도 세션 준비(AppShell 진입) 전까지는
  // 핸들러가 보관만 하므로 로그인 흐름을 방해하지 않는다.
  unawaited(
    InviteDeepLinkHandler.instance.init(
      onInviteToken: (token) => appNavigatorKey.currentState?.push(
        MaterialPageRoute(builder: (_) => JoinTripScreen(token: token)),
      ),
    ),
  );
  runApp(const ProviderScope(child: TripAndEndApp()));
}

Future<void> _initializeFirebase() async {
  if (kIsWeb) {
    if (!AppConfig.hasFirebaseWebOptions) {
      return;
    }
    await Firebase.initializeApp(
      options: const FirebaseOptions(
        apiKey: AppConfig.firebaseWebApiKey,
        authDomain: AppConfig.firebaseWebAuthDomain,
        projectId: AppConfig.firebaseWebProjectId,
        storageBucket: AppConfig.firebaseWebStorageBucket,
        messagingSenderId: AppConfig.firebaseWebMessagingSenderId,
        appId: AppConfig.firebaseWebAppId,
      ),
    );
    return;
  }

  // firebase_options.dart 없이 초기화 — android/app/google-services.json,
  // ios/Runner/GoogleService-Info.plist를 네이티브 빌드가 읽어서 자동으로 설정을 채운다
  // (FlutterFire CLI로 만드는 DefaultFirebaseOptions와 동일한 값을 얻는 또 다른 방법).
  await Firebase.initializeApp();
}

class TripAndEndApp extends StatelessWidget {
  const TripAndEndApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: appNavigatorKey,
      title: 'trip and end',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF5B4778),
        scaffoldBackgroundColor: Colors.white,
        useMaterial3: true,
        fontFamily: 'Pretendard',
        appBarTheme: const AppBarTheme(centerTitle: true),
      ),
      home: const _StartupGate(),
    );
  }
}

/// 저장된 액세스 토큰이 있으면 GET /users/me로 세션이 아직 유효한지 확인해 바로
/// 앱 셸로 보낸다. 토큰이 없거나(첫 실행) 만료돼서 refresh까지 실패하면(ApiClient의
/// 401 인터셉터가 이미 처리) 로그인 화면으로 보낸다. 응답 자체(user)는 각 탭이
/// 필요하면 자기 컨트롤러로 직접 조회하므로 여기선 세션 유효성 확인 용도로만 쓴다.
class _StartupGate extends ConsumerStatefulWidget {
  const _StartupGate();

  @override
  ConsumerState<_StartupGate> createState() => _StartupGateState();
}

class _StartupGateState extends ConsumerState<_StartupGate> {
  late final Future<Widget> _resolved = _resolve();

  Future<Widget> _resolve() async {
    final tokenStorage = ref.read(tokenStorageProvider);
    final accessToken = await tokenStorage.readAccessToken();
    if (accessToken == null) {
      return const LoginScreen();
    }

    try {
      final usersApi = UsersApi(ref.read(apiClientProvider));
      // ApiClient의 Dio 타임아웃이 1차 방어선이지만, 시작 화면이 무한 로딩에
      // 빠지는 일만은 없도록 세션 확인에도 상한을 둔다. 초과하면 아래 catch가
      // 토큰을 지우고 로그인 화면으로 보낸다.
      await usersApi.getMe().timeout(const Duration(seconds: 12));
      // 권한 팝업/FCM 토큰 발급을 기다리면 시작 화면이 멈춰 보이므로 기다리지 않는다.
      unawaited(
        ref
            .read(pushNotificationServiceProvider)
            .syncDevice(usersApi: usersApi, tokenStorage: tokenStorage),
      );
      return const AppShell();
    } catch (_) {
      await tokenStorage.clear();
      return const LoginScreen();
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Widget>(
      future: _resolved,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        return snapshot.data ?? const LoginScreen();
      },
    );
  }
}
