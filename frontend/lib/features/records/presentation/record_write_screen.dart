import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../data/record_summary_models.dart';
import 'record_upload_screen.dart' show recordsApiProvider;

/// 기록 본문 작성/수정(API 명세서 §4 PATCH .../records/{recordId}) — 캡션(제목) +
/// 본문, draft→published 전환. 결과로 `true`를 pop해 호출부(RecordDetailScreen)가
/// 다시 조회하도록 신호를 준다.
class RecordWriteScreen extends ConsumerStatefulWidget {
  const RecordWriteScreen({super.key, required this.record});

  final RecordDetail record;

  @override
  ConsumerState<RecordWriteScreen> createState() => _RecordWriteScreenState();
}

class _RecordWriteScreenState extends ConsumerState<RecordWriteScreen> {
  late final _titleController = TextEditingController(text: widget.record.title ?? '');
  late final _contentController = TextEditingController(text: widget.record.content ?? '');
  bool _saving = false;

  @override
  void dispose() {
    _titleController.dispose();
    _contentController.dispose();
    super.dispose();
  }

  Future<void> _save({required bool publish}) async {
    setState(() => _saving = true);
    try {
      await ref
          .read(recordsApiProvider)
          .updateRecordText(
            widget.record.tripId,
            widget.record.id,
            title: _titleController.text.trim(),
            content: _contentController.text.trim(),
            status: publish ? 'published' : 'draft',
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(() => _saving = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error is ApiException ? error.message : '저장하지 못했어요.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('기록 작성', style: TextStyle(color: AppColors.ink900, fontWeight: FontWeight.w800)),
        iconTheme: const IconThemeData(color: AppColors.ink900),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: _titleController,
                maxLength: 100,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.ink900),
                decoration: const InputDecoration(
                  hintText: '제목을 입력해주세요',
                  border: InputBorder.none,
                  counterText: '',
                ),
              ),
              const Divider(height: 1, color: AppColors.surfaceSubtle),
              const SizedBox(height: 4),
              Expanded(
                child: TextField(
                  controller: _contentController,
                  expands: true,
                  maxLines: null,
                  textAlignVertical: TextAlignVertical.top,
                  style: const TextStyle(fontSize: 15, height: 1.6, color: AppColors.ink900),
                  decoration: const InputDecoration(
                    hintText: '이번 여행은 어땠나요?',
                    border: InputBorder.none,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: AppButton(
                      label: '임시저장',
                      variant: AppButtonVariant.outline,
                      loading: _saving,
                      onPressed: () => _save(publish: false),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: AppButton(
                      label: '완료',
                      variant: AppButtonVariant.lime,
                      loading: _saving,
                      onPressed: () => _save(publish: true),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
