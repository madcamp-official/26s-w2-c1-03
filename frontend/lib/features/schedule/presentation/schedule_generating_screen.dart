import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/ai_badge.dart';
import '../../../core/widgets/app_button.dart';
import '../data/schedule_api.dart';
import 'schedule_result_screen.dart';

class ScheduleGeneratingScreen extends ConsumerStatefulWidget {
  const ScheduleGeneratingScreen({
    super.key,
    required this.tripId,
    required this.selectedPlaceIds,
  });

  final String tripId;
  final List<String> selectedPlaceIds;

  @override
  ConsumerState<ScheduleGeneratingScreen> createState() =>
      _ScheduleGeneratingScreenState();
}

class _ScheduleGeneratingScreenState
    extends ConsumerState<ScheduleGeneratingScreen> {
  bool _loading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    unawaited(_generate());
  }

  Future<void> _generate() async {
    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    try {
      final schedule = await ref
          .read(scheduleApiProvider)
          .generate(
            tripId: widget.tripId,
            selectedPlaceIds: widget.selectedPlaceIds,
          );
      if (!mounted) return;
      final completed = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => ScheduleResultScreen(schedule: schedule),
        ),
      );
      if (!mounted) return;
      Navigator.of(context).pop(completed ?? false);
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(() {
        _loading = false;
        _errorMessage = error is ApiException
            ? _scheduleErrorMessage(error)
            : '네트워크 연결을 확인해줘';
      });
    }
  }

  String _scheduleErrorMessage(ApiException error) {
    return switch (error.code) {
      'OPENAI_REQUEST_FAILED' => 'AI가 일정을 못 만들었어요. 잠시 후 다시 시도해줘.',
      'SELECTED_PLACES_INVALID' => '선택한 장소 정보를 다시 불러와야 해요.',
      _ => error.message,
    };
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_loading,
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          automaticallyImplyLeading: !_loading,
          iconTheme: const IconThemeData(color: AppColors.ink900),
        ),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 28),
            child: _loading ? _buildLoading() : _buildFailed(),
          ),
        ),
      ),
    );
  }

  Widget _buildLoading() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const AiBadge(label: 'AI 동선 생성'),
        const SizedBox(height: 18),
        const Text(
          '선택 완료!\n추천 장소까지 더해 일정을 짜는 중이에요',
          style: TextStyle(
            fontSize: 25,
            height: 1.25,
            fontWeight: FontWeight.w900,
            color: AppColors.ink900,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          '선택한 ${widget.selectedPlaceIds.length}곳은 꼭 포함하고, '
          '주변 추천 장소를 더해 여행 일수에 맞춰 나누고 있어요. '
          'AI 응답을 기다리는 동안 화면을 닫지 말아줘요.',
          style: const TextStyle(
            fontSize: 14,
            height: 1.55,
            fontWeight: FontWeight.w600,
            color: AppColors.ink600,
          ),
        ),
        const Spacer(),
        const Center(
          child: SizedBox(
            width: 54,
            height: 54,
            child: CircularProgressIndicator(
              strokeWidth: 4,
              color: AppColors.green800,
            ),
          ),
        ),
        const Spacer(),
        const _InfoCard(
          icon: Icons.lock_clock_outlined,
          title: '잠깐만 기다려줘',
          description: '후보 장소까지 함께 검토해서 최대 1분 정도 걸릴 수 있어요.',
        ),
      ],
    );
  }

  Widget _buildFailed() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '일정을 만들지 못했어요',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w900,
            color: AppColors.ink900,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          _errorMessage ?? '잠시 후 다시 시도해줘.',
          style: const TextStyle(
            fontSize: 14,
            height: 1.5,
            fontWeight: FontWeight.w600,
            color: AppColors.ink600,
          ),
        ),
        const SizedBox(height: 22),
        AppButton(
          label: '다시 생성하기',
          variant: AppButtonVariant.lime,
          aiSparkle: true,
          onPressed: _generate,
        ),
        const SizedBox(height: 10),
        AppButton(
          label: '장소 다시 고르기',
          variant: AppButtonVariant.outline,
          onPressed: () => Navigator.of(context).pop(false),
        ),
      ],
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.icon,
    required this.title,
    required this.description,
  });

  final IconData icon;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceSubtle,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.ink600, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  description,
                  style: const TextStyle(
                    fontSize: 12.5,
                    height: 1.35,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink600,
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
