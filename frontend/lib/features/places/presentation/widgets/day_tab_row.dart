import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// 상단에 떠 있는 "N일차" 탭. 여기서 고른 날짜가 지금부터 선택하는 장소의 배정 날짜다.
/// category_chip_row.dart와 같은 필박스 스타일을 쓴다.
class DayTabRow extends StatelessWidget {
  const DayTabRow({
    super.key,
    required this.dayCount,
    required this.selectedDay,
    required this.placeCountByDay,
    required this.onSelect,
  });

  final int dayCount;
  final int selectedDay;
  /// 일차별로 이미 선택해 둔 장소 수 — 탭에 작은 배지로 보여준다.
  final Map<int, int> placeCountByDay;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 22),
        itemCount: dayCount,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final day = index + 1;
          final isSelected = day == selectedDay;
          final count = placeCountByDay[day] ?? 0;
          return InkWell(
            onTap: () => onSelect(day),
            borderRadius: BorderRadius.circular(999),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected ? AppColors.ink900 : Colors.white,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: isSelected ? AppColors.ink900 : AppColors.border,
                  width: 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.06),
                    blurRadius: 8,
                  ),
                ],
              ),
              alignment: Alignment.center,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '$day일차',
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                      color: isSelected ? Colors.white : AppColors.ink600,
                    ),
                  ),
                  if (count > 0) ...[
                    const SizedBox(width: 5),
                    Text(
                      '$count',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: isSelected ? AppColors.lime : AppColors.green800,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
