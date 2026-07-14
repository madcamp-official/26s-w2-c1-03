import 'package:flutter/material.dart';
import '../../../../core/widgets/app_button.dart';

class PlaceFloatingCta extends StatelessWidget {
  const PlaceFloatingCta({
    super.key,
    required this.count,
    required this.onTap,
    this.loading = false,
  });

  final int count;
  final VoidCallback onTap;
  final bool loading;

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
          label: '$count곳 일정에 담기',
          variant: AppButtonVariant.lime,
          loading: loading,
          onPressed: onTap,
        ),
      ),
    );
  }
}
