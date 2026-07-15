import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/date_format.dart';
import '../../../core/widgets/app_back_button.dart';
import '../../../core/widgets/app_button.dart';
import '../data/record_photo_models.dart';
import '../data/record_summary_models.dart';
import 'record_photo_manage_screen.dart';
import 'record_upload_screen.dart' show recordsApiProvider;
import 'records_list_controller.dart';

sealed class _DetailState {
  const _DetailState();
}

class _DetailLoading extends _DetailState {
  const _DetailLoading();
}

class _DetailLoaded extends _DetailState {
  const _DetailLoaded(this.record);
  final RecordDetail record;
}

class _DetailFailed extends _DetailState {
  const _DetailFailed(this.message);
  final String message;
}

/// 기록을 Day별 다이어리로 보여주는 기본 화면 — 여행 시작일~종료일 각 날짜마다
/// 제목/본문/대표사진 하나씩(RecordDayEntry). 사진 실물 업로드/캡션/대표사진
/// 지정 같은 사진 파이프라인 관리는 RecordPhotoManageScreen으로 넘겼고, 여기서는
/// 그 사진들 중 하나를 Day의 대표사진으로 고르는 것만 다룬다.
class RecordDetailScreen extends ConsumerStatefulWidget {
  const RecordDetailScreen({super.key, required this.recordId});

  final String recordId;

  @override
  ConsumerState<RecordDetailScreen> createState() => _RecordDetailScreenState();
}

class _RecordDetailScreenState extends ConsumerState<RecordDetailScreen> {
  _DetailState _state = const _DetailLoading();
  bool _editing = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// [silent]가 true면(Day 저장/삭제, 제목 수정 등 이미 화면에 데이터가 떠 있는
  /// 상태에서의 새로고침) 로딩 스피너로 갈아엎지 않는다 — 매번 _DetailLoading을
  /// 거치면 ListView가 통째로 새로 만들어져 스크롤 위치가 맨 위로 튀어버린다.
  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() => _state = const _DetailLoading());
    try {
      final record = await ref.read(recordsApiProvider).getRecordDetail(widget.recordId);
      if (!mounted) return;
      setState(() => _state = _DetailLoaded(record));
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      if (silent) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error is ApiException ? error.message : '새로고침하지 못했어요.')),
        );
        return;
      }
      setState(
        () => _state = _DetailFailed(error is ApiException ? error.message : '네트워크 연결을 확인해주세요.'),
      );
    } catch (_) {
      // DioException이 아닌 예외(응답 파싱 실패 등)까지 여기서 잡아야 화면이
      // 로딩 상태로 영원히 멈추지 않는다 — 실기기에서 실제로 겪었던 문제
      // (서버가 예상과 다른 응답을 줬을 때 화면이 그대로 멈춤).
      if (!mounted) return;
      if (silent) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('새로고침하지 못했어요.')));
        return;
      }
      setState(() => _state = const _DetailFailed('기록을 불러오지 못했어요. 다시 시도해주세요.'));
    }
  }

  /// 사진 실물 관리(추가/캡션/대표사진)는 별도 화면으로 위임한다. 그 화면에서
  /// 기록 자체가 삭제됐으면('deleted' 시그널) 이 화면도 같이 닫는다.
  Future<void> _openPhotoManage(RecordDetail record) async {
    final result = await Navigator.of(
      context,
    ).push<Object?>(MaterialPageRoute(builder: (_) => RecordPhotoManageScreen(recordId: record.id)));
    if (!mounted) return;
    if (result == 'deleted') {
      Navigator.of(context).pop();
      return;
    }
    await _load(silent: true);
  }

  Future<void> _editTitle(RecordDetail record) async {
    final controller = TextEditingController(text: record.title ?? '');
    final saved = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('여행 기록 제목'),
        content: TextField(
          controller: controller,
          maxLength: 100,
          autofocus: true,
          decoration: const InputDecoration(hintText: '예: 도쿄 가을 여행'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(), child: const Text('취소')),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(controller.text.trim()),
            child: const Text('저장'),
          ),
        ],
      ),
    );
    if (saved == null || !mounted || saved == (record.title ?? '')) return;

    try {
      await ref.read(recordsApiProvider).updateRecordText(record.tripId, record.id, title: saved);
      if (!mounted) return;
      await _load(silent: true);
      ref.read(recordsListControllerProvider.notifier).load();
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error is ApiException ? error.message : '제목을 저장하지 못했어요.')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('제목을 저장하지 못했어요.')));
    }
  }

  /// Day 항목(제목/본문/대표사진) 작성/수정 바텀시트 — 대표사진은 이미 업로드된
  /// record.photos 중에서 사용자가 직접 고른다(§요청: 자동 선택 아님).
  Future<void> _editDay(RecordDetail record, String date, RecordDayEntry? existing) async {
    final titleController = TextEditingController(text: existing?.title ?? '');
    final contentController = TextEditingController(text: existing?.content ?? '');
    var selectedPhotoId = existing?.photo?.id;

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '${_dayLabel(record, date)} 기록',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink900),
                    ),
                    const SizedBox(height: 16),
                    if (record.photos.isNotEmpty) ...[
                      const Text(
                        '대표 사진',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.ink400),
                      ),
                      const SizedBox(height: 8),
                      SizedBox(
                        height: 84,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: record.photos.length,
                          separatorBuilder: (context, index) => const SizedBox(width: 8),
                          itemBuilder: (context, index) {
                            final photo = record.photos[index];
                            final selected = selectedPhotoId == photo.id;
                            return GestureDetector(
                              onTap: () => setSheetState(
                                () => selectedPhotoId = selected ? null : photo.id,
                              ),
                              child: Container(
                                width: 84,
                                height: 84,
                                padding: const EdgeInsets.all(2),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: selected ? AppColors.lime : Colors.transparent,
                                    width: 3,
                                  ),
                                ),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: Image.network(photo.storageUrl, fit: BoxFit.cover),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                    TextField(
                      controller: titleController,
                      maxLength: 100,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink900),
                      decoration: const InputDecoration(hintText: '이 날의 제목'),
                    ),
                    TextField(
                      controller: contentController,
                      maxLength: 1000,
                      maxLines: 4,
                      style: const TextStyle(fontSize: 14, color: AppColors.ink900),
                      decoration: const InputDecoration(hintText: '이 날은 어땠나요?'),
                    ),
                    const SizedBox(height: 8),
                    AppButton(
                      label: '저장',
                      variant: AppButtonVariant.lime,
                      onPressed: () => Navigator.of(sheetContext).pop(true),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (saved != true || !mounted) return;

    try {
      await ref
          .read(recordsApiProvider)
          .upsertDayEntry(
            record.tripId,
            record.id,
            date,
            title: titleController.text.trim().isEmpty ? null : titleController.text.trim(),
            content: contentController.text.trim().isEmpty ? null : contentController.text.trim(),
            photoId: selectedPhotoId,
          );
      if (!mounted) return;
      await _load(silent: true);
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error is ApiException ? error.message : '저장하지 못했어요. 다시 시도해주세요.')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('저장하지 못했어요. 다시 시도해주세요.')));
    }
  }

  /// 아직 항목이 없는 날짜 중 하나를 골라 새 Day를 만든다. 목록 자체가 이미
  /// 작성된 날짜만 보여주므로(빈 날은 표시하지 않음), 새 Day 추가는 이 진입점
  /// 하나로 모은다.
  Future<void> _addDay(RecordDetail record, List<String> availableDates) async {
    final selectedDate = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (sheetContext) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 20, 20, 8),
              child: Text(
                '어느 날짜를 기록할까요?',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink900),
              ),
            ),
            for (final date in availableDates)
              ListTile(
                title: Text(_dayLabel(record, date)),
                onTap: () => Navigator.of(sheetContext).pop(date),
              ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
    if (selectedDate == null || !mounted) return;
    await _editDay(record, selectedDate, null);
  }

  Future<void> _deleteDay(RecordDetail record, String date) async {
    try {
      await ref.read(recordsApiProvider).deleteDayEntry(record.tripId, record.id, date);
      if (!mounted) return;
      await _load(silent: true);
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error is ApiException ? error.message : '삭제하지 못했어요.')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('삭제하지 못했어요.')));
    }
  }

  String _dayLabel(RecordDetail record, String date) {
    final dates = _datesInRange(record.tripStartDate, record.tripEndDate);
    final dayNumber = dates.indexOf(date) + 1;
    final parsed = DateTime.parse(date);
    final monthDay =
        '${parsed.month.toString().padLeft(2, '0')}.${parsed.day.toString().padLeft(2, '0')}';
    return 'Day $dayNumber · $monthDay';
  }

  @override
  Widget build(BuildContext context) {
    final state = _state;
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: const AppBackButton(),
        title: const Text('여행 기록', style: TextStyle(color: AppColors.ink900, fontWeight: FontWeight.w800)),
        iconTheme: const IconThemeData(color: AppColors.ink900),
        actions: [
          if (state is _DetailLoaded) ...[
            IconButton(
              icon: const Icon(Icons.photo_library_outlined, color: AppColors.ink900),
              onPressed: () => _openPhotoManage(state.record),
            ),
            TextButton(
              onPressed: () => setState(() => _editing = !_editing),
              child: Text(
                _editing ? '완료' : '편집',
                style: const TextStyle(color: AppColors.ink900, fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ],
      ),
      body: SafeArea(child: _buildBody(state)),
    );
  }

  Widget _buildBody(_DetailState state) {
    return switch (state) {
      _DetailLoading() => const Center(child: CircularProgressIndicator(color: AppColors.ink900)),
      _DetailFailed(:final message) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              TextButton(onPressed: _load, child: const Text('다시 시도')),
            ],
          ),
        ),
      ),
      _DetailLoaded(:final record) => _RecordDiaryBody(
        record: record,
        editing: _editing,
        onEditTitle: () => _editTitle(record),
        onEditDay: (date, entry) => _editDay(record, date, entry),
        onDeleteDay: (date) => _deleteDay(record, date),
        onAddDay: (availableDates) => _addDay(record, availableDates),
      ),
    };
  }
}

List<String> _datesInRange(String startDate, String endDate) {
  final start = DateTime.parse(startDate);
  final end = DateTime.parse(endDate);
  final dayCount = end.difference(start).inDays;
  return [
    for (var i = 0; i <= dayCount; i++) _formatDate(start.add(Duration(days: i))),
  ];
}

String _formatDate(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

class _RecordDiaryBody extends StatelessWidget {
  const _RecordDiaryBody({
    required this.record,
    required this.editing,
    required this.onEditTitle,
    required this.onEditDay,
    required this.onDeleteDay,
    required this.onAddDay,
  });

  final RecordDetail record;
  final bool editing;
  final VoidCallback onEditTitle;
  final void Function(String date, RecordDayEntry? entry) onEditDay;
  final ValueChanged<String> onDeleteDay;
  final ValueChanged<List<String>> onAddDay;

  @override
  Widget build(BuildContext context) {
    final dates = _datesInRange(record.tripStartDate, record.tripEndDate);
    final entryByDate = {for (final entry in record.dayEntries) entry.date: entry};
    // 작성된 날짜만 보여준다 — 빈 날은 목록에서 아예 뺀다("+ 날짜 추가"로만 새로 만듦).
    final writtenDates = record.dayEntries.map((e) => e.date).toList()..sort();
    final availableDates = dates.where((d) => !entryByDate.containsKey(d)).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
      children: [
        GestureDetector(
          onTap: onEditTitle,
          behavior: HitTestBehavior.opaque,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Flexible(
                child: Text(
                  record.title?.isNotEmpty == true ? record.title! : '제목을 입력해주세요',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: record.title?.isNotEmpty == true ? AppColors.ink900 : AppColors.ink300,
                  ),
                ),
              ),
              if (editing) ...[
                const SizedBox(width: 8),
                const Icon(Icons.edit_outlined, size: 18, color: AppColors.ink400),
              ],
            ],
          ),
        ),
        const SizedBox(height: 6),
        Text(
          formatTripDateRange(record.tripStartDate, record.tripEndDate),
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.ink400),
        ),
        const SizedBox(height: 24),
        for (final date in writtenDates) ...[
          _DayEntryTile(
            dayNumber: dates.indexOf(date) + 1,
            date: date,
            entry: entryByDate[date]!,
            editing: editing,
            onEdit: () => onEditDay(date, entryByDate[date]),
            onDelete: () => onDeleteDay(date),
          ),
          const SizedBox(height: 28),
        ],
        if (editing && availableDates.isNotEmpty)
          AppButton(
            label: '+ 날짜 추가',
            variant: AppButtonVariant.outline,
            height: 40,
            onPressed: () => onAddDay(availableDates),
          ),
      ],
    );
  }
}

class _DayEntryTile extends StatelessWidget {
  const _DayEntryTile({
    required this.dayNumber,
    required this.date,
    required this.entry,
    required this.editing,
    required this.onEdit,
    required this.onDelete,
  });

  final int dayNumber;
  final String date;
  final RecordDayEntry entry;
  final bool editing;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final parsed = DateTime.parse(date);
    final monthDay = '${parsed.month.toString().padLeft(2, '0')}.${parsed.day.toString().padLeft(2, '0')}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(color: AppColors.lime, shape: BoxShape.circle),
            ),
            const SizedBox(width: 8),
            Text(
              'Day $dayNumber · $monthDay',
              style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.ink900),
            ),
            const Spacer(),
            if (editing) ...[
              IconButton(
                icon: const Icon(Icons.edit_outlined, size: 18, color: AppColors.ink400),
                visualDensity: VisualDensity.compact,
                onPressed: onEdit,
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline, size: 18, color: AppColors.danger),
                visualDensity: VisualDensity.compact,
                onPressed: onDelete,
              ),
            ],
          ],
        ),
        const SizedBox(height: 10),
        if (entry.photo != null) ...[
          AspectRatio(
            aspectRatio: 4 / 3,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Image.network(
                entry.photo!.storageUrl,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Container(color: AppColors.surfaceSubtle),
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],
        if (entry.title?.isNotEmpty == true)
          Text(
            entry.title!,
            style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: AppColors.ink900),
          ),
        if (entry.content?.isNotEmpty == true) ...[
          const SizedBox(height: 4),
          Text(
            entry.content!,
            style: const TextStyle(fontSize: 14, height: 1.5, fontWeight: FontWeight.w500, color: AppColors.ink600),
          ),
        ],
      ],
    );
  }
}
