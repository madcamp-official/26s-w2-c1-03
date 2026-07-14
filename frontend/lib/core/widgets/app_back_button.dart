import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// 뒤로가기 버튼 — 옅은 원형 배경 안에 화살표. 기본 AppBar 뒤로가기 화살표
/// 대신 이 위젯을 `leading`에 넣어 모든 화면에서 톤을 통일한다(트립 목록
/// 알림 벨 아이콘과 같은 원형 아이콘 버튼 스타일, trip_list_screen.dart 참고).
class AppBackButton extends StatelessWidget {
  const AppBackButton({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => Navigator.of(context).maybePop(),
        child: Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: AppColors.surfaceSubtle, shape: BoxShape.circle),
          child: const Icon(Icons.arrow_back_ios_new, size: 15, color: AppColors.ink900),
        ),
      ),
    );
  }
}
