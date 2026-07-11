import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// design.md §5.3 리스트 행 패턴. 앱 전체(스케줄·장소·설정 메뉴 등)에서 이 하나의
/// 행 패턴을 재사용한다 — 화면마다 새 리스트 스타일을 만들지 않는다.
class AppListRow extends StatelessWidget {
  const AppListRow({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.onTap,
    this.showDivider = true,
  });

  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 13),
        decoration: BoxDecoration(
          border: showDivider
              ? const Border(bottom: BorderSide(color: AppColors.border, width: 1))
              : null,
        ),
        child: Row(
          children: [
            if (leading != null) ...[leading!, const SizedBox(width: 13)],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink900,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      subtitle!,
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink400,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 8), trailing!],
          ],
        ),
      ),
    );
  }
}

/// 리스트 행의 트레일링으로 흔히 쓰는 chevron(§2.2 Ink 200).
class AppChevron extends StatelessWidget {
  const AppChevron({super.key});

  @override
  Widget build(BuildContext context) {
    return const Icon(Icons.chevron_right, color: AppColors.ink200, size: 22);
  }
}
