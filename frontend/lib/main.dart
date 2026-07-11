import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kakao_flutter_sdk_user/kakao_flutter_sdk_user.dart';
import 'core/config/app_config.dart';
import 'features/auth/presentation/login_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
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
      // 재시작 시 로그인 유지(저장된 토큰으로 홈 화면 바로 진입)는 GET /users/me가
      // 필요한데 아직 Phase 5 전이라 없다 — 지금은 항상 로그인 화면에서 시작한다.
      home: const LoginScreen(),
    );
  }
}
