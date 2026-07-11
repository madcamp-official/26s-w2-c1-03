import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../home/presentation/home_placeholder_screen.dart';
import 'auth_state.dart';
import 'login_controller.dart';

class LoginScreen extends ConsumerWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen<AuthState>(authControllerProvider, (previous, next) {
      if (next is AuthAuthenticated) {
        Navigator.of(
          context,
        ).pushReplacement(MaterialPageRoute(builder: (_) => HomePlaceholderScreen(user: next.user)));
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
                style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: Color(0xFF191F28)),
              ),
              const SizedBox(height: 8),
              const Text(
                '여행의 계획부터 기록까지, AI와 함께',
                style: TextStyle(fontSize: 14.5, color: Color(0xFF4E5968), fontWeight: FontWeight.w600),
              ),
              const Spacer(flex: 4),
              if (state is AuthFailed) ...[
                _ErrorBanner(message: _errorMessage(state)),
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
                    ? const Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)))
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

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF1F1),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Color(0xFFD14343), fontSize: 13.5, fontWeight: FontWeight.w600),
      ),
    );
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
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
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
          foregroundColor: const Color(0xFF191F28),
          side: const BorderSide(color: Color(0xFFD1D6DB)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        child: const Text('구글로 시작하기', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
      ),
    );
  }
}
