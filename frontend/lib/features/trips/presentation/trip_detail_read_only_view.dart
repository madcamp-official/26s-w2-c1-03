import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../data/trip_models.dart';

/// 일정이 아직 없을 때만 쓰는 뷰 — 일정이 있으면 TripDetailScreen이 대신
/// TripScheduleMapView(지도+드래그시트)를 전체 화면으로 띄운다.
class TripDetailReadOnlyView extends StatelessWidget {
  const TripDetailReadOnlyView({
    super.key,
    required this.trip,
    required this.onSelectPlaces,
    required this.onStartRecord,
  });

  final Trip trip;
  final VoidCallback onSelectPlaces;
  final VoidCallback onStartRecord;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _NoScheduleCard(onSelectPlaces: onSelectPlaces),
        // 여행 종료 후에만 사진첩 접근이 의미 있다(§8.1: 실제 조회는 여행 종료 후
        // 기록 시작 시점에만 발생). ongoing/planning에서는 버튼 자체를 숨긴다.
        if (trip.status == 'completed') ...[
          const SizedBox(height: 22),
          _RecordEntryCard(onStartRecord: onStartRecord),
        ],
      ],
    );
  }
}

class _RecordEntryCard extends StatelessWidget {
  const _RecordEntryCard({required this.onStartRecord});

  final VoidCallback onStartRecord;

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
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '여행이 끝났어요',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink900),
          ),
          const SizedBox(height: 6),
          const Text(
            '사진첩에서 이 기간 사진을 찾아 여행 기록을 시작해볼까?',
            style: TextStyle(fontSize: 13.5, height: 1.4, fontWeight: FontWeight.w600, color: AppColors.ink600),
          ),
          const SizedBox(height: 16),
          AppButton(label: '기록 시작', variant: AppButtonVariant.lime, aiSparkle: true, onPressed: onStartRecord),
        ],
      ),
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
