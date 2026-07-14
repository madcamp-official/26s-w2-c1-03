import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../data/schedule_api.dart';
import '../data/schedule_models.dart';
import 'schedule_chat_panel.dart';

/// 스케줄 편집 탭 — 장소 추가/삭제/메모 수정/드래그앤드롭 순서변경 + 우측 하단 FAB로
/// 여닫는 AI 챗봇 패널(화면 절반 높이). 편집 결과가 반영됐으면 pop(true)로 알려
/// 상세 화면이 스케줄을 재조회한다.
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
  bool _chatOpen = false;

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

  /// Day 내 드래그 순서 변경. Flutter 표준 인덱스 보정(newIndex>oldIndex면 -1)을 적용해
  /// 로컬 목록을 먼저 낙관적으로 재배열하고, 그 Day 전체를 1..n으로 renumber해 서버에
  /// 보낸다. 실패하면 스냅샷으로 원복해 화면과 서버가 어긋나지 않게 한다.
  Future<void> _reorderWithinDay(int dayNumber, int oldIndex, int newIndex) async {
    final snapshot = [..._places];
    final dayPlaces = _byDay[dayNumber]!
      ..sort((a, b) => a.orderInDay.compareTo(b.orderInDay));
    if (newIndex > oldIndex) newIndex -= 1;
    if (oldIndex == newIndex) return;

    final moved = dayPlaces.removeAt(oldIndex);
    dayPlaces.insert(newIndex, moved);

    // 그 Day 항목만 orderInDay를 1..n으로 다시 매기고, 나머지 Day는 그대로 둔다.
    final reindexed = <ScheduledTripPlace>[];
    for (var i = 0; i < dayPlaces.length; i++) {
      reindexed.add(dayPlaces[i].copyWith(orderInDay: i + 1));
    }
    setState(() {
      _places
        ..removeWhere((p) => p.dayNumber == dayNumber)
        ..addAll(reindexed);
      _places.sort(_byDayThenOrder);
      _changed = true;
    });

    try {
      await ref.read(scheduleApiProvider).reorder(
            tripId: widget.tripId,
            operations: [
              for (final p in reindexed)
                ReorderOperation(
                  tripPlaceId: p.id,
                  dayNumber: dayNumber,
                  orderInDay: p.orderInDay,
                ),
            ],
          );
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _places = snapshot);
      _showError(e.error, '순서를 저장하지 못했어요.');
    }
  }

  /// 챗봇 패널이 도구를 실행해 서버 일정을 바꿀 때마다 즉시 호출된다(대화창을 닫을
  /// 때까지 기다리지 않고 바로 화면에 반영).
  void _onChatScheduleChanged(SchedulePlan schedule) {
    setState(() {
      _places = [for (final day in schedule.days) ...day.places]..sort(_byDayThenOrder);
      _changed = true;
    });
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
          // 채팅창이 열리면 일정 영역을 Stack으로 덮는 대신 실제로 위쪽 절반만
          // 차지하도록 Column으로 공간을 나눈다 — 오버레이 방식은 아래쪽 일정이
          // 패널 뒤로 완전히 가려 안 보이는 문제가 있었다. 닫히면 Column이 다시
          // 계산되어 일정 영역이 자동으로 전체 높이를 되찾는다.
          child: Column(
            children: [
              Expanded(
                child: Stack(
                  children: [
                    days.isEmpty
                        ? const _EmptyState()
                        : ListView(
                            padding: const EdgeInsets.fromLTRB(22, 12, 22, 100),
                            children: [
                              const Padding(
                                padding: EdgeInsets.only(bottom: 10),
                                child: Text(
                                  '손잡이를 끌어 같은 날 안에서 순서를 바꿀 수 있어요.',
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.ink400,
                                  ),
                                ),
                              ),
                              for (final day in days) ...[
                                _DayEditSection(
                                  dayNumber: day,
                                  places: _byDay[day]!,
                                  busyIds: _busyIds,
                                  onDelete: _delete,
                                  onEditMemo: _editMemo,
                                  onReorder: (oldIndex, newIndex) =>
                                      _reorderWithinDay(day, oldIndex, newIndex),
                                ),
                                const SizedBox(height: 18),
                              ],
                            ],
                          ),
                    // 챗봇 진입 FAB — 채팅창이 닫혀 있을 때만 보인다.
                    if (!_chatOpen)
                      Positioned(
                        right: 18,
                        bottom: 18,
                        child: FloatingActionButton(
                          heroTag: 'schedule-chat-fab',
                          backgroundColor: AppColors.ink900,
                          onPressed: () => setState(() => _chatOpen = true),
                          child: const Icon(Icons.chat_bubble_outline, color: Colors.white),
                        ),
                      ),
                  ],
                ),
              ),
              if (_chatOpen)
                SizedBox(
                  height: MediaQuery.of(context).size.height * 0.5,
                  child: ScheduleChatPanel(
                    tripId: widget.tripId,
                    onScheduleChanged: _onChatScheduleChanged,
                    onClose: () => setState(() => _chatOpen = false),
                  ),
                ),
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
    required this.onReorder,
  });

  final int dayNumber;
  final List<ScheduledTripPlace> places;
  final Set<String> busyIds;
  final ValueChanged<ScheduledTripPlace> onDelete;
  final ValueChanged<ScheduledTripPlace> onEditMemo;
  final void Function(int oldIndex, int newIndex) onReorder;

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
          const SizedBox(height: 4),
          // 부모가 스크롤하는 ListView라 이 리스트는 shrinkWrap + 스크롤 비활성으로
          // 높이를 내용만큼만 차지하게 한다. 각 행에 안정적인 ValueKey(place.id)를 줘야
          // 드래그 중 위젯이 뒤섞이거나 잘못된 항목이 움직이는 UI 오류를 막을 수 있다.
          ReorderableListView(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            buildDefaultDragHandles: false,
            onReorder: onReorder,
            children: [
              for (var i = 0; i < sorted.length; i++)
                _PlaceEditRow(
                  key: ValueKey(sorted[i].id),
                  index: i,
                  place: sorted[i],
                  busy: busyIds.contains(sorted[i].id),
                  onDelete: () => onDelete(sorted[i]),
                  onEditMemo: () => onEditMemo(sorted[i]),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PlaceEditRow extends StatelessWidget {
  const _PlaceEditRow({
    super.key,
    required this.index,
    required this.place,
    required this.busy,
    required this.onDelete,
    required this.onEditMemo,
  });

  final int index;
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
            ReorderableDragStartListener(
              index: index,
              enabled: !busy,
              child: const Padding(
                padding: EdgeInsets.only(top: 1, right: 8),
                child: Icon(Icons.drag_indicator, size: 20, color: AppColors.ink200),
              ),
            ),
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
