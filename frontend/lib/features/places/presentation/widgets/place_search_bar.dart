import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

class PlaceSearchBar extends StatelessWidget {
  const PlaceSearchBar({
    super.key,
    required this.controller,
    required this.searching,
    required this.onSubmitted,
    required this.onClear,
  });

  final TextEditingController controller;
  final bool searching;
  final ValueChanged<String> onSubmitted;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 46,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border, width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 10,
          ),
        ],
      ),
      child: Row(
        children: [
          const Icon(Icons.search, size: 20, color: AppColors.ink400),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: controller,
              textInputAction: TextInputAction.search,
              onSubmitted: onSubmitted,
              style: const TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w600,
                color: AppColors.ink900,
              ),
              decoration: const InputDecoration(
                isDense: true,
                border: InputBorder.none,
                hintText: '장소 검색 · 예) 성산일출봉',
                hintStyle: TextStyle(
                  color: AppColors.ink400,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          if (searching)
            GestureDetector(
              onTap: onClear,
              behavior: HitTestBehavior.opaque,
              child: const Padding(
                padding: EdgeInsets.only(left: 6),
                child: Icon(Icons.close, size: 18, color: AppColors.ink400),
              ),
            ),
        ],
      ),
    );
  }
}
