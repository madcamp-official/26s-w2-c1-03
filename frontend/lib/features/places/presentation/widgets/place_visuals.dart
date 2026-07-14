import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../data/places_models.dart';

/// 장소 목록 행/상세 탭이 함께 쓰는 작은 시각 요소들 — place_sheet.dart와
/// place_detail_panel.dart 양쪽에서 재사용한다.

/// design.md §5.7 체크서클. 선택됨 = ink900 배경 + 라임 체크, 미선택 = outline만.
class SelectionCircleValue extends StatelessWidget {
  const SelectionCircleValue({super.key, required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: selected ? AppColors.ink900 : Colors.transparent,
        border: selected
            ? null
            : Border.all(color: AppColors.ink200, width: 1.8),
      ),
      child: selected
          ? const Icon(Icons.check, size: 16, color: AppColors.lime)
          : null,
    );
  }
}

class PlaceThumbnail extends StatelessWidget {
  const PlaceThumbnail({super.key, required this.candidate, this.size = 44});

  final PlaceCandidate candidate;
  final double size;

  @override
  Widget build(BuildContext context) {
    final imageUrl = candidate.imageUrl;
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: size,
        height: size,
        color: AppColors.surfaceSubtle,
        alignment: Alignment.center,
        child: imageUrl == null
            ? Icon(
                Icons.place_outlined,
                color: AppColors.ink400,
                size: size * 0.45,
              )
            : Image.network(
                imageUrl,
                fit: BoxFit.cover,
                width: size,
                height: size,
                errorBuilder: (_, _, _) => Icon(
                  Icons.place_outlined,
                  color: AppColors.ink400,
                  size: size * 0.45,
                ),
              ),
      ),
    );
  }
}
