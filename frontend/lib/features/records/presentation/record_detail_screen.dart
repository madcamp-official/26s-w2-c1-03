import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../data/record_summary_models.dart';
import 'record_upload_screen.dart' show recordsApiProvider;
import 'record_write_screen.dart';
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

/// 기록 상세(API 명세서 §5 GET /records/{recordId}) — 사진 목록 + 본문, 수정/삭제.
/// TripDetailScreen과 같은 이유로 이 화면 하나에만 쓰는 상태라 로컬 setState로
/// 관리한다(recordId 하나에 매인 일회성 화면).
class RecordDetailScreen extends ConsumerStatefulWidget {
  const RecordDetailScreen({super.key, required this.recordId});

  final String recordId;

  @override
  ConsumerState<RecordDetailScreen> createState() => _RecordDetailScreenState();
}

class _RecordDetailScreenState extends ConsumerState<RecordDetailScreen> {
  _DetailState _state = const _DetailLoading();
  bool _deleting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = const _DetailLoading());
    try {
      final record = await ref.read(recordsApiProvider).getRecordDetail(widget.recordId);
      if (!mounted) return;
      setState(() => _state = _DetailLoaded(record));
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(
        () => _state = _DetailFailed(error is ApiException ? error.message : '네트워크 연결을 확인해주세요.'),
      );
    }
  }

  Future<void> _openWrite(RecordDetail record) async {
    final changed = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => RecordWriteScreen(record: record)));
    if (!mounted) return;
    if (changed == true) {
      await _load();
      ref.read(recordsListControllerProvider.notifier).load();
    }
  }

  Future<void> _confirmAndDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('기록을 삭제할까요?'),
        content: const Text('사진과 글이 모두 삭제되고 되돌릴 수 없어요.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('취소')),
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
      await ref.read(recordsApiProvider).deleteRecord(widget.recordId);
      ref.read(recordsListControllerProvider.notifier).load();
      if (!mounted) return;
      Navigator.of(context).pop();
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(() => _deleting = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error is ApiException ? error.message : '삭제하지 못했어요.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = _state;
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('기록', style: TextStyle(color: AppColors.ink900, fontWeight: FontWeight.w800)),
        iconTheme: const IconThemeData(color: AppColors.ink900),
        actions: [
          if (state is _DetailLoaded)
            IconButton(
              icon: const Icon(Icons.edit_outlined, color: AppColors.ink900),
              onPressed: () => _openWrite(state.record),
            ),
          if (state is _DetailLoaded)
            IconButton(
              icon: _deleting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.danger),
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
      _DetailLoaded(:final record) => _RecordDetailBody(record: record),
    };
  }
}

class _RecordDetailBody extends StatelessWidget {
  const _RecordDetailBody({required this.record});
  final RecordDetail record;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        if (record.photos.isNotEmpty)
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
            ),
            itemCount: record.photos.length,
            itemBuilder: (context, index) {
              final photo = record.photos[index];
              return ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.network(
                  photo.storageUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) =>
                      Container(color: AppColors.surfaceSubtle),
                ),
              );
            },
          )
        else
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppColors.surfaceSubtle,
              borderRadius: BorderRadius.circular(14),
            ),
            alignment: Alignment.center,
            child: const Text(
              '아직 이 기록에 담긴 사진이 없어요',
              style: TextStyle(color: AppColors.ink400, fontWeight: FontWeight.w600),
            ),
          ),
        const SizedBox(height: 20),
        Text(
          record.title?.isNotEmpty == true ? record.title! : '제목 없음',
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink900),
        ),
        const SizedBox(height: 10),
        Text(
          record.content?.isNotEmpty == true ? record.content! : '아직 작성된 글이 없어요. 오른쪽 위 연필 아이콘으로 글을 써보세요.',
          style: const TextStyle(
            fontSize: 14.5,
            height: 1.6,
            fontWeight: FontWeight.w500,
            color: AppColors.ink600,
          ),
        ),
      ],
    );
  }
}
