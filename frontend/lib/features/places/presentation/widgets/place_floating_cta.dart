import 'package:flutter/material.dart';
import '../../../../core/widgets/app_button.dart';

class PlaceFloatingCta extends StatelessWidget {
  const PlaceFloatingCta({
    super.key,
    required this.count,
    required this.onTap,
    this.loading = false,
    this.label,
  });

  final int count;
  final VoidCallback onTap;
  final bool loading;

  /// 생략하면 "N곳 일정에 담기"(새 일정 만들기 문구)를 쓴다. 기존 일정에 장소를
  /// 추가하는 화면처럼 문구가 달라야 할 때 재사용한다.
  final String? label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(22, 12, 22, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 28,
            offset: const Offset(0, -8),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: AppButton(
          label: label ?? '$count곳 일정에 담기',
          variant: AppButtonVariant.lime,
          loading: loading,
          onPressed: onTap,
        ),
      ),
    );
  }
}
