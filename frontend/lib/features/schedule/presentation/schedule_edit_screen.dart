import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../data/schedule_api.dart';
import '../data/schedule_models.dart';

/// 스케줄 편집 탭 — 장소 삭제 / 메모 수정. 순서 변경(드래그앤드롭)과 장소 추가,
/// AI 재수정은 후속 커밋에서 이 화면에 얹는다. 편집 결과가 반영됐으면 pop(true)로
/// 알려 상세 화면이 스케줄을 재조회한다.
class ScheduleEditScreen extends ConsumerStatefulWidget {
  const ScheduleEditScreen({
    super.key,
    required this.tripId,
    required this.schedule,
  });

  final String tripId;
  final SchedulePlan schedule;

  @override
  ConsumerState<ScheduleEditScreen> createState() => _ScheduleEditScreenState();
}

class _ScheduleEditScreenState extends ConsumerState<ScheduleEditScreen> {
  /// 서버 상태를 반영하는 로컬 가변 목록(플랫). 렌더링 시 dayNumber로 그룹핑한다.
  late List<ScheduledTripPlace> _places;
  bool _changed = false;
  final Set<String> _busyIds = {};

  @override
  void initState() {
    super.initState();
    _places = [
      for (final day in widget.schedule.days) ...day.places,
    ]..sort(_byDayThenOrder);
  }

  int _byDayThenOrder(ScheduledTripPlace a, ScheduledTripPlace b) {
    final byDay = a.dayNumber.compareTo(b.dayNumber);
    return byDay != 0 ? byDay : a.orderInDay.compareTo(b.orderInDay);
  }

  Map<int, List<ScheduledTripPlace>> get _byDay {
    final map = <int, List<ScheduledTripPlace>>{};
    for (final place in _places) {
      (map[place.dayNumber] ??= []).add(place);
    }
    return map;
  }

  void _showError(Object? error, String fallback) {
    if (!mounted) return;
    final message = error is ApiException ? error.message : fallback;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _delete(ScheduledTripPlace place) async {
    setState(() => _busyIds.add(place.id));
    try {
      await ref
          .read(scheduleApiProvider)
          .removePlace(tripId: widget.tripId, tripPlaceId: place.id);
      if (!mounted) return;
      setState(() {
        _places.removeWhere((p) => p.id == place.id);
        _changed = true;
      });
    } on DioException catch (e) {
      _showError(e.error, '장소를 삭제하지 못했어요.');
    } finally {
      if (mounted) setState(() => _busyIds.remove(place.id));
    }
  }

  Future<void> _editMemo(ScheduledTripPlace place) async {
    final result = await showDialog<String?>(
      context: context,
      builder: (_) => _MemoDialog(initial: place.memo),
    );
    // 다이얼로그가 취소되면 null 래퍼 없이 그냥 닫힌다(_MemoResult로 구분).
    if (result == null || !mounted) return;
    final newMemo = result.isEmpty ? null : result;

    setState(() => _busyIds.add(place.id));
    try {
      final updated = await ref.read(scheduleApiProvider).updatePlace(
            tripId: widget.tripId,
            tripPlaceId: place.id,
            memo: newMemo,
          );
      if (!mounted) return;
      setState(() {
        final index = _places.indexWhere((p) => p.id == place.id);
        if (index != -1) _places[index] = updated;
        _changed = true;
      });
    } on DioException catch (e) {
      _showError(e.error, '메모를 저장하지 못했어요.');
    } finally {
      if (mounted) setState(() => _busyIds.remove(place.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final days = _byDay.keys.toList()..sort();

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.close, color: AppColors.ink900),
            onPressed: () => Navigator.of(context).pop(_changed),
          ),
          title: const Text(
            '일정 편집',
            style: TextStyle(color: AppColors.ink900, fontWeight: FontWeight.w800),
          ),
        ),
        body: SafeArea(
          child: days.isEmpty
              ? const _EmptyState()
              : ListView(
                  padding: const EdgeInsets.fromLTRB(22, 12, 22, 40),
                  children: [
                    for (final day in days) ...[
                      _DayEditSection(
                        dayNumber: day,
                        places: _byDay[day]!,
                        busyIds: _busyIds,
                        onDelete: _delete,
                        onEditMemo: _editMemo,
                      ),
                      const SizedBox(height: 18),
                    ],
                  ],
                ),
        ),
      ),
    );
  }
}

class _DayEditSection extends StatelessWidget {
  const _DayEditSection({
    required this.dayNumber,
    required this.places,
    required this.busyIds,
    required this.onDelete,
    required this.onEditMemo,
  });

  final int dayNumber;
  final List<ScheduledTripPlace> places;
  final Set<String> busyIds;
  final ValueChanged<ScheduledTripPlace> onDelete;
  final ValueChanged<ScheduledTripPlace> onEditMemo;

  @override
  Widget build(BuildContext context) {
    final sorted = [...places]..sort((a, b) => a.orderInDay.compareTo(b.orderInDay));
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
            'Day $dayNumber',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              color: AppColors.ink900,
            ),
          ),
          const SizedBox(height: 12),
          for (final place in sorted)
            _PlaceEditRow(
              place: place,
              busy: busyIds.contains(place.id),
              onDelete: () => onDelete(place),
              onEditMemo: () => onEditMemo(place),
            ),
        ],
      ),
    );
  }
}

class _PlaceEditRow extends StatelessWidget {
  const _PlaceEditRow({
    required this.place,
    required this.busy,
    required this.onDelete,
    required this.onEditMemo,
  });

  final ScheduledTripPlace place;
  final bool busy;
  final VoidCallback onDelete;
  final VoidCallback onEditMemo;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: busy ? 0.5 : 1,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (place.startTime != null) ...[
              Padding(
                padding: const EdgeInsets.only(top: 1),
                child: Text(
                  place.startTime!,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: AppColors.green800,
                  ),
                ),
              ),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    place.name.isEmpty ? '이름 없는 장소' : place.name,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: AppColors.ink900,
                    ),
                  ),
                  if (place.memo != null && place.memo!.isNotEmpty) ...[
                    const SizedBox(height: 3),
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
            IconButton(
              visualDensity: VisualDensity.compact,
              icon: const Icon(Icons.notes, size: 20, color: AppColors.ink400),
              onPressed: busy ? null : onEditMemo,
            ),
            IconButton(
              visualDensity: VisualDensity.compact,
              icon: const Icon(Icons.delete_outline, size: 20, color: AppColors.danger),
              onPressed: busy ? null : onDelete,
            ),
          ],
        ),
      ),
    );
  }
}

class _MemoDialog extends StatefulWidget {
  const _MemoDialog({this.initial});
  final String? initial;

  @override
  State<_MemoDialog> createState() => _MemoDialogState();
}

class _MemoDialogState extends State<_MemoDialog> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.initial ?? '');

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('메모'),
      content: TextField(
        controller: _controller,
        autofocus: true,
        maxLines: 3,
        decoration: const InputDecoration(hintText: '이 장소에 대한 메모'),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('취소'),
        ),
        TextButton(
          // 빈 문자열 = 메모 삭제, 취소(null)와 구분한다.
          onPressed: () => Navigator.of(context).pop(_controller.text.trim()),
          child: const Text('저장'),
        ),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Text(
        '편집할 일정이 없어요.',
        style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink600),
      ),
    );
  }
}
