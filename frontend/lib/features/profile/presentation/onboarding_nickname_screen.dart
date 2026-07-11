import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../home/presentation/app_shell.dart';
import 'profile_controller.dart';

/// 최초 로그인 시 필수로 거치는 닉네임 입력 화면(기능명세서 §5 "최초 로그인 시
/// 필요한 최소 정보(닉네임)만 추가로 입력받을 수 있다"). 완료해야 홈으로 넘어간다.
class OnboardingNicknameScreen extends ConsumerStatefulWidget {
  const OnboardingNicknameScreen({super.key, required this.initialNickname});

  final String initialNickname;

  @override
  ConsumerState<OnboardingNicknameScreen> createState() => _OnboardingNicknameScreenState();
}

class _OnboardingNicknameScreenState extends ConsumerState<OnboardingNicknameScreen> {
  late final TextEditingController _controller = TextEditingController(text: widget.initialNickname);
  String? _errorText;
  bool _submitting = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final nickname = _controller.text.trim();
    if (nickname.isEmpty) {
      setState(() => _errorText = '닉네임을 입력해주세요.');
      return;
    }
    if (nickname.length > 30) {
      setState(() => _errorText = '닉네임은 30자 이내로 입력해주세요.');
      return;
    }

    setState(() {
      _errorText = null;
      _submitting = true;
    });

    final saved = await ref.read(profileControllerProvider.notifier).updateNickname(nickname);
    if (!mounted) return;

    if (saved) {
      Navigator.of(
        context,
      ).pushReplacement(MaterialPageRoute(builder: (_) => const AppShell()));
      return;
    }

    setState(() {
      _submitting = false;
      _errorText = '저장하지 못했어요. 다시 시도해주세요.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 48),
              const Text(
                '어떻게 불러드릴까요?',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Color(0xFF191F28)),
              ),
              const SizedBox(height: 8),
              const Text(
                '나중에 프로필에서 언제든 바꿀 수 있어요.',
                style: TextStyle(fontSize: 14, color: Color(0xFF8B95A1), fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 28),
              TextField(
                controller: _controller,
                maxLength: 30,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: '닉네임',
                  errorText: _errorText,
                  filled: true,
                  fillColor: const Color(0xFFF2F4F6),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF191F28),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: _submitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('시작하기', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
