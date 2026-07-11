import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kakao_flutter_sdk_user/kakao_flutter_sdk_user.dart';
import 'core/config/app_config.dart';
import 'features/auth/presentation/login_controller.dart';
import 'features/auth/presentation/login_screen.dart';
import 'features/home/presentation/home_placeholder_screen.dart';
import 'features/profile/data/users_api.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // firebase_options.dart 없이 초기화 — android/app/google-services.json,
  // ios/Runner/GoogleService-Info.plist를 네이티브 빌드가 읽어서 자동으로 설정을 채운다
  // (FlutterFire CLI로 만드는 DefaultFirebaseOptions와 동일한 값을 얻는 또 다른 방법).
  await Firebase.initializeApp();
  KakaoSdk.init(nativeAppKey: AppConfig.kakaoNativeAppKey);
  runApp(const ProviderScope(child: TripAndEndApp()));
}

class TripAndEndApp extends StatelessWidget {
  const TripAndEndApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'trip and end',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF191F28),
        scaffoldBackgroundColor: Colors.white,
        useMaterial3: true,
      ),
      home: const _StartupGate(),
    );
  }
}

/// 저장된 액세스 토큰이 있으면 GET /users/me로 세션이 아직 유효한지 확인해 바로
/// 홈으로 보낸다. 토큰이 없거나(첫 실행) 만료돼서 refresh까지 실패하면(ApiClient의
/// 401 인터셉터가 이미 처리) 로그인 화면으로 보낸다.
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
      final user = await usersApi.getMe();
      return HomePlaceholderScreen(user: user);
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
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        return snapshot.data ?? const LoginScreen();
      },
    );
  }
}
