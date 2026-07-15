import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// 기록/스케줄/마이 탭 상단 제목. Scaffold.appBar 대신 스크롤 목록의 첫 항목으로
/// 넣어서 쓴다 — appBar와 달리 화면 상단에 고정되지 않고 콘텐츠와 함께 스크롤된다.
/// 가운데 정렬·글자 크기(18px)는 기록 탭 원래 AppBar 스타일과 동일하게 맞췄다.
class TabHeader extends StatelessWidget {
  const TabHeader({super.key, required this.title, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(6, 10, 6, 6),
      child: Row(
        children: [
          const SizedBox(width: 44),
          Expanded(
            child: Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.ink900,
              ),
            ),
          ),
          SizedBox(width: 44, child: trailing ?? const SizedBox.shrink()),
        ],
      ),
    );
  }
}
