import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/ai_badge.dart';
import '../../../core/widgets/app_button.dart';
import '../data/schedule_api.dart';
import '../data/schedule_models.dart';

/// AI 프롬프트 재수정 플로우. 프롬프트 입력 → revise로 제안 받기(저장 안 함) →
/// 항목별 체크로 선택 수용 → applyRevision으로 전체 교체. 반영에 성공하면 pop(true).
class ScheduleReviseScreen extends ConsumerStatefulWidget {
  const ScheduleReviseScreen({super.key, required this.tripId});

  final String tripId;

  @override
  ConsumerState<ScheduleReviseScreen> createState() => _ScheduleReviseScreenState();
}

class _ScheduleReviseScreenState extends ConsumerState<ScheduleReviseScreen> {
  final _promptController = TextEditingController();
  bool _requesting = false;
  bool _applying = false;
  ScheduleProposal? _proposal;
  // 제안 항목별 수용 여부 — key는 dayNumber와 orderInDay 조합(제안 내에서 유일).
  final Set<String> _excluded = {};

  @override
  void dispose() {
    _promptController.dispose();
    super.dispose();
  }

  String _keyOf(ProposalItem item) => '${item.dayNumber}-${item.orderInDay}';

  void _showError(Object? error, String fallback) {
    if (!mounted) return;
    final message = error is ApiException ? error.message : fallback;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _requestRevision() async {
    final prompt = _promptController.text.trim();
    if (prompt.isEmpty) return;
    FocusScope.of(context).unfocus();

    setState(() => _requesting = true);
    try {
      final proposal =
          await ref.read(scheduleApiProvider).revise(tripId: widget.tripId, prompt: prompt);
      if (!mounted) return;
      setState(() {
        _proposal = proposal;
        _excluded.clear();
      });
    } on DioException catch (e) {
      _showError(e.error, 'AI가 일정을 수정하지 못했어요. 잠시 후 다시 시도해줘.');
    } finally {
      if (mounted) setState(() => _requesting = false);
    }
  }

  Future<void> _apply() async {
    final proposal = _proposal;
    if (proposal == null) return;

    // 제외되지 않은 항목만 모아 각 날짜별 orderInDay를 1..n으로 다시 매긴다.
    final selected = <ProposalItem>[];
    final counters = <int, int>{};
    for (final day in proposal.days) {
      for (final item in day.places) {
        if (_excluded.contains(_keyOf(item))) continue;
        final next = (counters[item.dayNumber] ?? 0) + 1;
        counters[item.dayNumber] = next;
        selected.add(ProposalItem(
          placeId: item.placeId,
          customName: item.customName,
          customAddress: item.customAddress,
          dayNumber: item.dayNumber,
          orderInDay: next,
          startTime: item.startTime,
          name: item.name,
          address: item.address,
        ));
      }
    }

    setState(() => _applying = true);
    try {
      await ref
          .read(scheduleApiProvider)
          .applyRevision(tripId: widget.tripId, items: selected);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on DioException catch (e) {
      _showError(e.error, '수정한 일정을 반영하지 못했어요.');
    } finally {
      if (mounted) setState(() => _applying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final proposal = _proposal;
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.ink900),
        title: const Text(
          'AI로 일정 수정',
          style: TextStyle(color: AppColors.ink900, fontWeight: FontWeight.w800),
        ),
      ),
      body: SafeArea(
        child: proposal == null
            ? _buildPromptView()
            : _buildProposalView(proposal),
      ),
    );
  }

  Widget _buildPromptView() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(22, 16, 22, 24),
      children: [
        const AiBadge(label: 'AI 재수정'),
        const SizedBox(height: 14),
        const Text(
          '어떻게 바꿔줄까요?',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: AppColors.ink900),
        ),
        const SizedBox(height: 8),
        const Text(
          '예: "둘째 날을 더 여유롭게 해줘", "바다 근처 카페를 넣어줘", "저녁은 회 먹고 싶어"',
          style: TextStyle(fontSize: 13.5, height: 1.5, fontWeight: FontWeight.w600, color: AppColors.ink600),
        ),
        const SizedBox(height: 18),
        TextField(
          controller: _promptController,
          autofocus: true,
          maxLines: 4,
          maxLength: 500,
          decoration: InputDecoration(
            hintText: '수정 요청을 자유롭게 적어주세요',
            filled: true,
            fillColor: AppColors.surfaceSubtle,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide.none,
            ),
          ),
        ),
        const SizedBox(height: 8),
        AppButton(
          label: 'AI에게 수정 요청',
          aiSparkle: true,
          loading: _requesting,
          onPressed: _requestRevision,
        ),
      ],
    );
  }

  Widget _buildProposalView(ScheduleProposal proposal) {
    final days = [...proposal.days]..sort((a, b) => a.dayNumber.compareTo(b.dayNumber));
    final selectedCount = days.fold<int>(
      0,
      (sum, day) => sum + day.places.where((p) => !_excluded.contains(_keyOf(p))).length,
    );

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(22, 14, 22, 24),
            children: [
              const Text(
                'AI가 수정한 일정이에요',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: AppColors.ink900),
              ),
              const SizedBox(height: 6),
              const Text(
                '반영할 장소만 체크한 채로 두고, 빼고 싶은 장소는 체크를 해제하세요.',
                style: TextStyle(fontSize: 13, height: 1.45, fontWeight: FontWeight.w600, color: AppColors.ink600),
              ),
              const SizedBox(height: 18),
              for (final day in days) ...[
                _ProposalDayCard(
                  day: day,
                  isExcluded: (item) => _excluded.contains(_keyOf(item)),
                  onToggle: (item, include) => setState(() {
                    if (include) {
                      _excluded.remove(_keyOf(item));
                    } else {
                      _excluded.add(_keyOf(item));
                    }
                  }),
                ),
                const SizedBox(height: 16),
              ],
            ],
          ),
        ),
        _BottomBar(
          selectedCount: selectedCount,
          applying: _applying,
          onRetry: _applying ? null : () => setState(() => _proposal = null),
          onApply: selectedCount == 0 ? null : _apply,
        ),
      ],
    );
  }
}

class _ProposalDayCard extends StatelessWidget {
  const _ProposalDayCard({
    required this.day,
    required this.isExcluded,
    required this.onToggle,
  });

  final ProposalDay day;
  final bool Function(ProposalItem) isExcluded;
  final void Function(ProposalItem item, bool include) onToggle;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.borderStrong),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Day ${day.dayNumber}',
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.ink900),
          ),
          const SizedBox(height: 6),
          for (final item in day.places)
            _ProposalRow(
              item: item,
              excluded: isExcluded(item),
              onChanged: (include) => onToggle(item, include),
            ),
        ],
      ),
    );
  }
}

class _ProposalRow extends StatelessWidget {
  const _ProposalRow({required this.item, required this.excluded, required this.onChanged});

  final ProposalItem item;
  final bool excluded;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => onChanged(excluded),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Checkbox(
              value: !excluded,
              visualDensity: VisualDensity.compact,
              activeColor: AppColors.green800,
              onChanged: (v) => onChanged(v ?? false),
            ),
            if (item.startTime != null) ...[
              Text(
                item.startTime!,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.green800),
              ),
              const SizedBox(width: 8),
            ],
            Expanded(
              child: Text(
                item.name.isEmpty ? '이름 없는 장소' : item.name,
                style: TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w700,
                  color: excluded ? AppColors.ink400 : AppColors.ink900,
                  decoration: excluded ? TextDecoration.lineThrough : null,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({
    required this.selectedCount,
    required this.applying,
    required this.onRetry,
    required this.onApply,
  });

  final int selectedCount;
  final bool applying;
  final VoidCallback? onRetry;
  final VoidCallback? onApply;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(22, 12, 22, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 20,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: AppButton(
                label: '다시 요청',
                variant: AppButtonVariant.outline,
                height: 48,
                onPressed: onRetry,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: AppButton(
                label: '$selectedCount곳 반영',
                height: 48,
                loading: applying,
                onPressed: onApply,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
