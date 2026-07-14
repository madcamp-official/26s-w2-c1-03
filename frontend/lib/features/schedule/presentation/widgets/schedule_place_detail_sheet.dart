import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// 일정 편집 행의 "상세 설정" 버튼이 여는 시트 — 메모/시간/비용을 탭으로 나눠 한 번에
/// 저장한다. 세 값을 모두 채워 반환하므로(취소 시 null) 저장 시 항상 세 필드를 함께 보낸다.
class SchedulePlaceDetailResult {
  const SchedulePlaceDetailResult({required this.memo, required this.startTime, required this.cost});

  final String? memo;
  final String? startTime;
  final int? cost;
}

/// [initialMemo]/[initialStartTime]/[initialCost]로 초기화된 탭 시트를 띄운다.
/// 취소하면 null, 저장하면 세 값을 담은 [SchedulePlaceDetailResult]를 반환한다.
Future<SchedulePlaceDetailResult?> showSchedulePlaceDetailSheet(
  BuildContext context, {
  required String placeName,
  String? initialMemo,
  String? initialStartTime,
  int? initialCost,
}) {
  return showModalBottomSheet<SchedulePlaceDetailResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => _SchedulePlaceDetailSheet(
      placeName: placeName,
      initialMemo: initialMemo,
      initialStartTime: initialStartTime,
      initialCost: initialCost,
    ),
  );
}

class _SchedulePlaceDetailSheet extends StatefulWidget {
  const _SchedulePlaceDetailSheet({
    required this.placeName,
    required this.initialMemo,
    required this.initialStartTime,
    required this.initialCost,
  });

  final String placeName;
  final String? initialMemo;
  final String? initialStartTime;
  final int? initialCost;

  @override
  State<_SchedulePlaceDetailSheet> createState() => _SchedulePlaceDetailSheetState();
}

class _SchedulePlaceDetailSheetState extends State<_SchedulePlaceDetailSheet> {
  late final _memoController = TextEditingController(text: widget.initialMemo ?? '');
  late final _costController = TextEditingController(
    text: widget.initialCost != null ? widget.initialCost.toString() : '',
  );
  late String? _startTime = widget.initialStartTime;

  @override
  void dispose() {
    _memoController.dispose();
    _costController.dispose();
    super.dispose();
  }

  Future<void> _pickTime() async {
    final initial = _parseTime(_startTime) ?? TimeOfDay.now();
    final picked = await showTimePicker(context: context, initialTime: initial);
    if (picked == null) return;
    setState(() {
      _startTime =
          '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    });
  }

  TimeOfDay? _parseTime(String? value) {
    if (value == null) return null;
    final parts = value.split(':');
    if (parts.length != 2) return null;
    final hour = int.tryParse(parts[0]);
    final minute = int.tryParse(parts[1]);
    if (hour == null || minute == null) return null;
    return TimeOfDay(hour: hour, minute: minute);
  }

  void _save() {
    final memo = _memoController.text.trim();
    final cost = int.tryParse(_costController.text.trim());
    Navigator.of(context).pop(
      SchedulePlaceDetailResult(
        memo: memo.isEmpty ? null : memo,
        startTime: _startTime,
        cost: cost,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: SafeArea(
          child: SizedBox(
            height: MediaQuery.of(context).size.height * 0.62,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          widget.placeName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: AppColors.ink900,
                          ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, color: AppColors.ink400),
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                    ],
                  ),
                ),
                const TabBar(
                  labelColor: AppColors.ink900,
                  unselectedLabelColor: AppColors.ink400,
                  indicatorColor: AppColors.ink900,
                  tabs: [Tab(text: '메모'), Tab(text: '시간'), Tab(text: '비용')],
                ),
                Expanded(
                  child: TabBarView(
                    children: [
                      _MemoTab(controller: _memoController),
                      _TimeTab(startTime: _startTime, onPick: _pickTime, onClear: () => setState(() => _startTime = null)),
                      _CostTab(controller: _costController),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _save,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.ink900,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      child: const Text('저장', style: TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MemoTab extends StatelessWidget {
  const _MemoTab({required this.controller});

  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: TextField(
        controller: controller,
        autofocus: true,
        maxLines: 6,
        decoration: const InputDecoration(
          hintText: '이 장소에 대한 메모를 남겨보세요',
          border: OutlineInputBorder(),
        ),
      ),
    );
  }
}

class _TimeTab extends StatelessWidget {
  const _TimeTab({required this.startTime, required this.onPick, required this.onClear});

  final String? startTime;
  final VoidCallback onPick;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          OutlinedButton.icon(
            onPressed: onPick,
            icon: const Icon(Icons.schedule),
            label: Text(startTime ?? '방문 시각 선택'),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 18),
              foregroundColor: AppColors.ink900,
              side: const BorderSide(color: AppColors.borderStrong),
            ),
          ),
          if (startTime != null) ...[
            const SizedBox(height: 8),
            TextButton(onPressed: onClear, child: const Text('시간 지우기')),
          ],
        ],
      ),
    );
  }
}

class _CostTab extends StatelessWidget {
  const _CostTab({required this.controller});

  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: TextField(
        controller: controller,
        keyboardType: TextInputType.number,
        decoration: const InputDecoration(
          hintText: '0',
          suffixText: '원',
          border: OutlineInputBorder(),
        ),
      ),
    );
  }
}
