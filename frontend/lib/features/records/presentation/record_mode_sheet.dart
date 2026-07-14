import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../../trips/data/trip_models.dart';
import 'record_filter_run_screen.dart';
import 'record_manual_pick_screen.dart';

enum _RecordMode { ai, manual, fallback }

/// "기록 시작" 진입점(트립 상세의 버튼, 기록 탭의 "+" → 트립 선택, 기록 상세의
/// "사진 추가" 버튼 셋 다 여기로 모인다) — 화면 전환 없이 바텀시트로 AI 추천/
/// 직접 선택/폴백 중 고르게 한다. 고른 뒤 실제 화면(RecordFilterRunScreen 또는
/// RecordManualPickScreen)으로 들어가 끝까지(finalize) 마치면 그 결과(성공
/// 여부)를 push+pop 체인으로 이어받아 반환한다 — 호출부가 사진이 실제로
/// 추가됐는지 알고 필요하면 자기 화면을 새로고침할 수 있게 하기 위함이다.
Future<bool> showRecordModeSheet(BuildContext context, Trip trip) async {
  final mode = await showModalBottomSheet<_RecordMode>(
    context: context,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (_) => _RecordModeSheetContent(trip: trip),
  );
  if (mode == null || !context.mounted) return false;

  final next = switch (mode) {
    _RecordMode.ai => RecordFilterRunScreen(trip: trip, useFallback: false),
    _RecordMode.manual => RecordManualPickScreen(trip: trip),
    _RecordMode.fallback => RecordFilterRunScreen(trip: trip, useFallback: true),
  };
  final success = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => next));
  return success ?? false;
}

class _RecordModeSheetContent extends StatelessWidget {
  const _RecordModeSheetContent({required this.trip});

  final Trip trip;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 12, 22, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.surfaceSubtle,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              '어떻게 기록을 시작할까?',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink900),
            ),
            const SizedBox(height: 4),
            const Text(
              '이 기간에 찍은 사진만 기기에서 확인해요. 사진 실물은 이 단계에서 서버로 전송되지 않아요.',
              style: TextStyle(fontSize: 12.5, height: 1.5, fontWeight: FontWeight.w600, color: AppColors.ink600),
            ),
            const SizedBox(height: 20),
            AppButton(
              label: 'AI가 사진 골라줄게',
              variant: AppButtonVariant.lime,
              aiSparkle: true,
              onPressed: () => Navigator.of(context).pop(_RecordMode.ai),
            ),
            const SizedBox(height: 10),
            AppButton(
              label: '내가 직접 고를래',
              variant: AppButtonVariant.outline,
              onPressed: () => Navigator.of(context).pop(_RecordMode.manual),
            ),
            const SizedBox(height: 12),
            Center(
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(_RecordMode.fallback),
                child: const Text(
                  '필터 없이 최근 사진으로 진행',
                  style: TextStyle(fontSize: 12.5, color: AppColors.ink400, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
