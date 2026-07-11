import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../../home/presentation/app_shell.dart';
import '../../profile/presentation/onboarding_nickname_screen.dart';
import 'auth_state.dart';
import 'login_controller.dart';

class LoginScreen extends ConsumerWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen<AuthState>(authControllerProvider, (previous, next) {
      if (next is AuthAuthenticated) {
        // 최초 로그인이면 닉네임부터 받는다(기능명세서 §5) — 그 전엔 홈으로 보내지 않는다.
        final route = next.isNewUser
            ? MaterialPageRoute<void>(
                builder: (_) => OnboardingNicknameScreen(initialNickname: next.user.nickname),
              )
            : MaterialPageRoute<void>(builder: (_) => const AppShell());
        Navigator.of(context).pushReplacement(route);
      }
    });

    final state = ref.watch(authControllerProvider);
    final isLoading = state is AuthAuthenticating;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 22),
          child: Column(
            children: [
              const Spacer(flex: 3),
              const Text(
                'trip and end',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppColors.ink900),
              ),
              const SizedBox(height: 8),
              const Text(
                '여행의 계획부터 기록까지, AI와 함께',
                style: TextStyle(fontSize: 14.5, color: AppColors.ink600, fontWeight: FontWeight.w600),
              ),
              const Spacer(flex: 4),
              if (state is AuthFailed) ...[
                AppErrorBanner(message: _errorMessage(state)),
                const SizedBox(height: 16),
              ],
              _KakaoLoginButton(
                onPressed: isLoading
                    ? null
                    : () => ref.read(authControllerProvider.notifier).loginWithKakao(),
              ),
              const SizedBox(height: 12),
              _GoogleLoginButton(
                onPressed: isLoading
                    ? null
                    : () => ref.read(authControllerProvider.notifier).loginWithGoogle(),
              ),
              const SizedBox(height: 24),
              SizedBox(
                height: 20,
                child: isLoading
                    ? const Center(
                        child: SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.ink400),
                        ),
                      )
                    : null,
              ),
              const Spacer(flex: 2),
            ],
          ),
        ),
      ),
    );
  }

  String _errorMessage(AuthFailed state) {
    switch (state.code) {
      case 'NETWORK_ERROR':
        return '네트워크 연결을 확인해주세요.';
      case 'TOKEN_INVALID':
        return '로그인이 만료됐어요. 다시 시도해주세요.';
      case 'PROVIDER_ERROR':
        return '로그인 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.';
      default:
        return '문제가 발생했어요. 다시 시도해주세요.';
    }
  }
}

/// 카카오 공식 로그인 버튼 가이드라인(노란 배경 #FEE500, 어두운 텍스트) 준수.
/// 실제 카카오 심볼 아이콘은 별도 에셋이 필요해 이번엔 텍스트 버튼으로만 처리했다.
class _KakaoLoginButton extends StatelessWidget {
  const _KakaoLoginButton({required this.onPressed});
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFFFEE500),
          foregroundColor: const Color(0xFF191600),
          disabledBackgroundColor: const Color(0xFFFDF3A0),
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
        ),
        child: const Text('카카오로 시작하기', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
      ),
    );
  }
}

/// 구글 "Sign in with Google" 버튼 가이드라인(흰 배경 + 옅은 보더) 준수.
class _GoogleLoginButton extends StatelessWidget {
  const _GoogleLoginButton({required this.onPressed});
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          backgroundColor: Colors.white,
          foregroundColor: AppColors.ink900,
          side: const BorderSide(color: AppColors.ink200),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
        ),
        child: const Text('구글로 시작하기', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
      ),
    );
  }
}
