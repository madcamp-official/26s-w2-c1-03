import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// design.md §5.4 "AI 추천" 인라인 배지. AI가 개입한 콘텐츠에만 붙인다 — 사용자가
/// 직접 만든 콘텐츠에는 쓰지 않는다(§8 안티패턴 8번).
class AiBadge extends StatelessWidget {
  const AiBadge({super.key, this.label = 'AI 추천'});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.limeBg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 10.5,
          fontWeight: FontWeight.w800,
          color: AppColors.lime,
        ),
      ),
    );
  }
}

/// design.md §5.4 배너형 AI 안내. ✨ 이모지 + 2단 텍스트(제목/설명).
class AiBanner extends StatelessWidget {
  const AiBanner({super.key, required this.title, required this.description});

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.limeBg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('✨', style: TextStyle(fontSize: 20)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.lime,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink600,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
