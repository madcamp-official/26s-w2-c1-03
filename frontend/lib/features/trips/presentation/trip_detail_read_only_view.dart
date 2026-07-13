import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_gradients.dart';
import '../../../core/widgets/ai_badge.dart';
import '../../../core/widgets/app_button.dart';
import '../../schedule/data/schedule_models.dart';
import '../data/trip_models.dart';

class TripDetailReadOnlyView extends StatelessWidget {
  const TripDetailReadOnlyView({
    super.key,
    required this.trip,
    required this.schedule,
    required this.hasSchedule,
    required this.onSelectPlaces,
  });

  final Trip trip;
  final SchedulePlan schedule;
  final bool hasSchedule;
  final VoidCallback onSelectPlaces;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _TripHero(trip: trip),
        const SizedBox(height: 22),
        if (hasSchedule)
          _ScheduleOverview(schedule: schedule)
        else
          _NoScheduleCard(onSelectPlaces: onSelectPlaces),
      ],
    );
  }
}

class _TripHero extends StatelessWidget {
  const _TripHero({required this.trip});

  final Trip trip;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        gradient: AppGradients.forKey(trip.id),
        borderRadius: BorderRadius.circular(26),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _StatusBadge(status: trip.status),
              const Spacer(),
              const AiBadge(label: 'AI 일정'),
            ],
          ),
          const SizedBox(height: 28),
          Text(
            trip.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 28,
              height: 1.12,
              fontWeight: FontWeight.w900,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            '${trip.cityName} · ${trip.startDate} – ${trip.endDate}',
            style: const TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w700,
              color: Color(0xF2FFFFFF),
            ),
          ),
        ],
      ),
    );
  }
}

class _ScheduleOverview extends StatelessWidget {
  const _ScheduleOverview({required this.schedule});

  final SchedulePlan schedule;

  @override
  Widget build(BuildContext context) {
    final days = [...schedule.days]
      ..sort((a, b) => a.dayNumber.compareTo(b.dayNumber));
    final placeCount = days.fold<int>(0, (sum, day) => sum + day.places.length);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              '여행 일정',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: AppColors.ink900,
              ),
            ),
            Text(
              '$placeCount곳',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: AppColors.ink400,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        for (final day in days.where((day) => day.places.isNotEmpty)) ...[
          _ScheduleDayCard(day: day),
          const SizedBox(height: 14),
        ],
      ],
    );
  }
}

class _ScheduleDayCard extends StatelessWidget {
  const _ScheduleDayCard({required this.day});

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
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: AppColors.ink900,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  'DAY ${day.dayNumber}',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                '${places.length} stops',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink400,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          for (var index = 0; index < places.length; index++) ...[
            _SchedulePlaceTile(place: places[index]),
            if (index != places.length - 1)
              const Padding(
                padding: EdgeInsets.only(left: 13),
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

class _SchedulePlaceTile extends StatelessWidget {
  const _SchedulePlaceTile({required this.place});

  final ScheduledTripPlace place;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: AppColors.lime,
            shape: BoxShape.circle,
          ),
          child: Text(
            '${place.orderInDay}',
            style: const TextStyle(
              fontSize: 12,
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
                const SizedBox(height: 3),
                Text(
                  place.address!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    height: 1.35,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink600,
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

class _NoScheduleCard extends StatelessWidget {
  const _NoScheduleCard({required this.onSelectPlaces});

  final VoidCallback onSelectPlaces;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surfaceSubtle,
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(
        children: [
          const Text('🧭', style: TextStyle(fontSize: 36)),
          const SizedBox(height: 10),
          const Text(
            '아직 일정 초안이 없어',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: AppColors.ink900,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            '가고 싶은 곳을 고르면 AI가 추천 장소까지 더해 일정을 만들어줘.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13.5,
              height: 1.45,
              fontWeight: FontWeight.w600,
              color: AppColors.ink600,
            ),
          ),
          const SizedBox(height: 16),
          AppButton(
            label: '장소 고르러 가기',
            variant: AppButtonVariant.lime,
            aiSparkle: true,
            onPressed: onSelectPlaces,
          ),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final label = switch (status) {
      'planning' => '계획 중',
      'ongoing' => '여행 중',
      'completed' => '완료',
      _ => status,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceSubtle,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
          color: AppColors.ink600,
        ),
      ),
    );
  }
}
