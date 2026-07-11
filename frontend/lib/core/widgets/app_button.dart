import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// design.md §2.4: Ink 버튼(확정/이동 액션) vs Lime 버튼(AI 관여 생성/추천 액션).
/// 버튼에 AI 개입이 있으면 lime, 없으면 ink — 이 구분을 항상 지킨다.
enum AppButtonVariant { ink, lime, outline }

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.ink,
    this.loading = false,
    this.height = 52,
    this.aiSparkle = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final bool loading;
  final double height;

  /// lime 버튼에서 라벨 앞에 ✨를 붙일지. AI 개입 액션에서만 true로 쓴다.
  final bool aiSparkle;

  @override
  Widget build(BuildContext context) {
    final (bg, fg, disabledBg) = switch (variant) {
      AppButtonVariant.ink => (AppColors.ink900, Colors.white, const Color(0xFFB0B8C1)),
      AppButtonVariant.lime => (AppColors.lime, AppColors.green900, const Color(0xFFFBFDDD)),
      AppButtonVariant.outline => (Colors.white, AppColors.ink900, Colors.white),
    };

    final child = loading
        ? SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2, color: fg),
          )
        : Text(
            aiSparkle ? '✨ $label' : label,
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: fg),
          );

    final button = ElevatedButton(
      onPressed: loading ? null : onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: bg,
        disabledBackgroundColor: disabledBg,
        foregroundColor: fg,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(15),
          side: variant == AppButtonVariant.outline
              ? const BorderSide(color: AppColors.ink200)
              : BorderSide.none,
        ),
      ),
      child: child,
    );

    return SizedBox(width: double.infinity, height: height, child: button);
  }
}

/// 실패 상태 배너(§8: 빨강 계열은 danger 토큰만 사용).
class AppErrorBanner extends StatelessWidget {
  const AppErrorBanner({super.key, required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.dangerBg,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: const TextStyle(color: AppColors.danger, fontSize: 13.5, fontWeight: FontWeight.w600),
      ),
    );
  }
}
