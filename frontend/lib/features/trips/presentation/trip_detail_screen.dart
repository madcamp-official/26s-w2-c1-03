import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../../places/presentation/place_selection_screen.dart';
import '../../records/presentation/record_intro_screen.dart';
import '../../schedule/data/schedule_api.dart';
import '../../schedule/data/schedule_models.dart';
import '../../schedule/presentation/schedule_edit_screen.dart';
import '../../schedule/presentation/schedule_generating_screen.dart';
import '../data/trip_models.dart';
import 'trip_detail_read_only_view.dart';
import 'trip_list_controller.dart';

sealed class _DetailState {
  const _DetailState();
}

class _DetailLoading extends _DetailState {
  const _DetailLoading();
}

class _DetailLoaded extends _DetailState {
  const _DetailLoaded(this.trip, this.schedule);
  final Trip trip;
  final SchedulePlan schedule;
}

class _DetailFailed extends _DetailState {
  const _DetailFailed(this.message);
  final String message;
}

/// 상세 조회/인라인 수정/삭제. 이 화면은 tripId 하나에 매인 일회성 화면이라
/// Riverpod StateNotifier 대신 로컬 setState로 관리한다(다른 화면과 공유할
/// 상태가 아님 — TripListScreen/ProfileScreen처럼 앱 전역에서 watch될 필요 없음).
class TripDetailScreen extends ConsumerStatefulWidget {
  const TripDetailScreen({super.key, required this.tripId});

  final String tripId;

  @override
  ConsumerState<TripDetailScreen> createState() => _TripDetailScreenState();
}

class _TripDetailScreenState extends ConsumerState<TripDetailScreen> {
  _DetailState _state = const _DetailLoading();
  final _titleController = TextEditingController();
  DateTimeRange? _dateRange;
  bool _editing = false;
  bool _saving = false;
  bool _deleting = false;
  bool _redirectedToPlaceSelection = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _state = const _DetailLoading());
    try {
      final trip = await ref.read(tripsApiProvider).getDetail(widget.tripId);
      final schedule = await ref
          .read(scheduleApiProvider)
          .getSchedule(widget.tripId);
      _titleController.text = trip.title;
      _dateRange = DateTimeRange(
        start: DateTime.parse(trip.startDate),
        end: DateTime.parse(trip.endDate),
      );
      if (!mounted) return;
      setState(() => _state = _DetailLoaded(trip, schedule));
      if (!_hasSchedule(schedule) && !_redirectedToPlaceSelection) {
        _redirectedToPlaceSelection = true;
        unawaited(_openPlaceSelection(trip.id, trip.startDate, trip.endDate));
      }
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(
        () => _state = _DetailFailed(
          error is ApiException ? error.message : '네트워크 연결을 확인해주세요.',
        ),
      );
    }
  }

  Future<void> _pickDateRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 2),
      initialDateRange: _dateRange,
    );
    if (picked != null) {
      setState(() => _dateRange = picked);
    }
  }

  Future<void> _save() async {
    final title = _titleController.text.trim();
    if (title.isEmpty || _dateRange == null) return;

    setState(() => _saving = true);
    try {
      final updated = await ref
          .read(tripsApiProvider)
          .update(
            widget.tripId,
            title: title,
            startDate: _formatDate(_dateRange!.start),
            endDate: _formatDate(_dateRange!.end),
          );
      unawaited(ref.read(tripListControllerProvider.notifier).load());
      if (!mounted) return;
      setState(() {
        final previous = _state;
        final schedule = previous is _DetailLoaded
            ? previous.schedule
            : const SchedulePlan(days: []);
        _state = _DetailLoaded(updated, schedule);
        _editing = false;
        _saving = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error is ApiException ? error.message : '저장하지 못했어요.'),
        ),
      );
    }
  }

  Future<void> _confirmAndDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('여행을 삭제할까요?'),
        content: const Text('삭제하면 되돌릴 수 없어요.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('취소'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('삭제', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _deleting = true);
    try {
      await ref.read(tripsApiProvider).delete(widget.tripId);
      unawaited(ref.read(tripListControllerProvider.notifier).load());
      if (!mounted) return;
      Navigator.of(context).pop();
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(() => _deleting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error is ApiException ? error.message : '삭제하지 못했어요.'),
        ),
      );
    }
  }

  String _formatDate(DateTime date) {
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    return '${date.year}-$month-$day';
  }

  bool _hasSchedule(SchedulePlan schedule) {
    return schedule.days.any((day) => day.places.isNotEmpty);
  }

  Future<void> _openPlaceSelection(
    String tripId,
    String startDate,
    String endDate,
  ) async {
    final generated = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => PlaceSelectionScreen(
          tripId: tripId,
          startDate: startDate,
          endDate: endDate,
        ),
      ),
    );
    if (!mounted) return;
    if (generated == true) {
      _redirectedToPlaceSelection = false;
      await _load();
    }
  }

  /// "AI로 스케줄 짜기" — 지금까지 등록된(수동/이전 AI 결과 불문) 장소를 각자
  /// 배정된 날짜 그대로 다시 AI에 넘겨 최적 동선으로 교체한다. custom(직접 입력)
  /// 장소는 placeId가 없어 AI 생성 대상에서 제외한다.
  Future<void> _openAiGenerate(Trip trip, SchedulePlan schedule) async {
    final selectedPlaces = [
      for (final day in schedule.days)
        for (final place in day.places)
          if (place.placeId != null)
            SelectedPlace(placeId: place.placeId!, dayNumber: day.dayNumber),
    ];
    if (selectedPlaces.isEmpty) return;
    final completed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ScheduleGeneratingScreen(
          tripId: trip.id,
          selectedPlaces: selectedPlaces,
        ),
      ),
    );
    if (!mounted) return;
    if (completed == true) await _load();
  }

  Future<void> _openScheduleEdit(SchedulePlan schedule) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) =>
            ScheduleEditScreen(tripId: widget.tripId, schedule: schedule),
      ),
    );
    if (!mounted) return;
    if (changed == true) await _load();
  }

  void _openRecordIntro(Trip trip) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => RecordIntroScreen(trip: trip)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = _state;
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          '여행 상세',
          style: TextStyle(
            color: AppColors.ink900,
            fontWeight: FontWeight.w700,
          ),
        ),
        iconTheme: const IconThemeData(color: AppColors.ink900),
        actions: [
          if (state is _DetailLoaded && !_editing)
            IconButton(
              icon: const Icon(Icons.edit_outlined, color: AppColors.ink900),
              onPressed: () => setState(() => _editing = true),
            ),
          if (state is _DetailLoaded)
            IconButton(
              icon: _deleting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.danger,
                      ),
                    )
                  : const Icon(Icons.delete_outline, color: AppColors.danger),
              onPressed: _deleting ? null : _confirmAndDelete,
            ),
        ],
      ),
      body: SafeArea(child: _buildBody(state)),
    );
  }

  Widget _buildBody(_DetailState state) {
    if (state is _DetailLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state is _DetailFailed) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(state.message, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              TextButton(onPressed: _load, child: const Text('다시 시도')),
            ],
          ),
        ),
      );
    }

    final loaded = state as _DetailLoaded;
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.ink900,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(22, 14, 22, 120),
        children: _editing
            ? _buildEditFields()
            : _buildReadOnlyFields(loaded.trip, loaded.schedule),
      ),
    );
  }

  List<Widget> _buildEditFields() {
    return [
      TextField(
        controller: _titleController,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w700,
          color: AppColors.ink900,
        ),
        decoration: InputDecoration(
          filled: true,
          fillColor: AppColors.surfaceSubtle,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide.none,
          ),
        ),
      ),
      const SizedBox(height: 12),
      InkWell(
        onTap: _pickDateRange,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          decoration: BoxDecoration(
            color: AppColors.surfaceSubtle,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Text(
            _dateRange == null
                ? '여행 기간 선택'
                : '${_formatDate(_dateRange!.start)} ~ ${_formatDate(_dateRange!.end)}',
            style: const TextStyle(
              fontSize: 14.5,
              fontWeight: FontWeight.w600,
              color: AppColors.ink900,
            ),
          ),
        ),
      ),
      const SizedBox(height: 16),
      Row(
        children: [
          Expanded(
            child: AppButton(
              label: '취소',
              variant: AppButtonVariant.outline,
              height: 48,
              onPressed: _saving
                  ? null
                  : () => setState(() => _editing = false),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: AppButton(
              label: '저장',
              height: 48,
              loading: _saving,
              onPressed: _save,
            ),
          ),
        ],
      ),
    ];
  }

  List<Widget> _buildReadOnlyFields(Trip trip, SchedulePlan schedule) {
    return [
      TripDetailReadOnlyView(
        trip: trip,
        schedule: schedule,
        hasSchedule: _hasSchedule(schedule),
        onSelectPlaces: () =>
            _openPlaceSelection(trip.id, trip.startDate, trip.endDate),
        onEditSchedule: () => _openScheduleEdit(schedule),
        onGenerateAi: () => _openAiGenerate(trip, schedule),
        onStartRecord: () => _openRecordIntro(trip),
      ),
    ];
  }
}
