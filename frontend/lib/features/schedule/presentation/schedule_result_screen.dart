import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/ai_badge.dart';
import '../../../core/widgets/app_button.dart';
import '../data/schedule_models.dart';

class ScheduleResultScreen extends StatelessWidget {
  const ScheduleResultScreen({super.key, required this.schedule});

  final SchedulePlan schedule;

  int get _placeCount =>
      schedule.days.fold(0, (sum, day) => sum + day.places.length);

  @override
  Widget build(BuildContext context) {
    final days = [...schedule.days]
      ..sort((a, b) => a.dayNumber.compareTo(b.dayNumber));

    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          automaticallyImplyLeading: false,
          title: const Text(
            'AI 추천 일정',
            style: TextStyle(
              color: AppColors.ink900,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(22, 10, 22, 24),
                  children: [
                    const AiBadge(label: 'AI 초안'),
                    const SizedBox(height: 14),
                    const Text(
                      '동선 초안이 완성됐어요',
                      style: TextStyle(
                        fontSize: 25,
                        fontWeight: FontWeight.w900,
                        color: AppColors.ink900,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '선택한 장소는 반드시 포함하고, 주변 관광지와 식사 시간에 맞춘 식당·카페까지 더해 총 $_placeCount곳을 시간순으로 배치했어요.',
                      style: const TextStyle(
                        fontSize: 14,
                        height: 1.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink600,
                      ),
                    ),
                    const SizedBox(height: 22),
                    if (days.isEmpty)
                      const _EmptyScheduleCard()
                    else
                      for (final day in days) ...[
                        _DaySection(day: day),
                        const SizedBox(height: 18),
                      ],
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(22, 12, 22, 12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      blurRadius: 22,
                      offset: const Offset(0, -8),
                    ),
                  ],
                ),
                child: SafeArea(
                  top: false,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AppButton(
                        label: '여행 상세로 돌아가기',
                        onPressed: () => Navigator.of(context).pop(true),
                      ),
                      const SizedBox(height: 8),
                      AppButton(
                        label: '장소 다시 고르기',
                        variant: AppButtonVariant.outline,
                        onPressed: () => Navigator.of(context).pop(false),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DaySection extends StatelessWidget {
  const _DaySection({required this.day});

  final ScheduleDay day;

  @override
  Widget build(BuildContext context) {
    final places = [...day.places]
      ..sort((a, b) => a.orderInDay.compareTo(b.orderInDay));

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppColors.borderStrong),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Day ${day.dayNumber}',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              color: AppColors.ink900,
            ),
          ),
          const SizedBox(height: 12),
          for (var index = 0; index < places.length; index++) ...[
            _PlaceRow(place: places[index]),
            if (index != places.length - 1)
              const Padding(
                padding: EdgeInsets.only(left: 17),
                child: SizedBox(
                  height: 18,
                  child: VerticalDivider(
                    width: 1,
                    thickness: 1,
                    color: AppColors.ink200,
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _PlaceRow extends StatelessWidget {
  const _PlaceRow({required this.place});

  final ScheduledTripPlace place;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 34,
          height: 34,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: AppColors.lime,
            shape: BoxShape.circle,
          ),
          child: Text(
            '${place.orderInDay}',
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w900,
              color: AppColors.green800,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  if (place.startTime != null) ...[
                    Text(
                      place.startTime!,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: AppColors.green800,
                      ),
                    ),
                    const SizedBox(width: 7),
                  ],
                  Expanded(
                    child: Text(
                      place.name.isEmpty ? '이름 없는 장소' : place.name,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: AppColors.ink900,
                      ),
                    ),
                  ),
                ],
              ),
              if (place.address != null && place.address!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  place.address!,
                  style: const TextStyle(
                    fontSize: 12.5,
                    height: 1.35,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink600,
                  ),
                ),
              ],
              if (place.memo != null && place.memo!.isNotEmpty) ...[
                const SizedBox(height: 5),
                Text(
                  place.memo!,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink400,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _EmptyScheduleCard extends StatelessWidget {
  const _EmptyScheduleCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surfaceSubtle,
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Text(
        '아직 표시할 일정이 없어요.',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          color: AppColors.ink600,
        ),
      ),
    );
  }
}
