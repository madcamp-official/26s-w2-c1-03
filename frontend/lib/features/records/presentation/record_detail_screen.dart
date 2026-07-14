import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../../trips/presentation/trip_list_controller.dart' show tripsApiProvider;
import '../data/record_photo_models.dart';
import '../data/record_summary_models.dart';
import 'record_mode_sheet.dart';
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
  bool _openingPicker = false;
  String? _togglingCoverPhotoId;

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

  /// 이 기록에 사진을 더 추가한다 — 같은 트립에 대해 "기록 시작"을 다시 밟는
  /// 것과 동일하다(startSession이 (trip_id,user_id) unique라 기존 기록을 그대로
  /// 재사용하므로 새 기록이 아니라 이 기록에 사진이 이어서 쌓인다). 모드 시트가
  /// Trip 전체(기간/도시 등)를 필요로 해서 tripId로 상세를 한 번 더 조회한다.
  Future<void> _addPhotos(RecordDetail record) async {
    setState(() => _openingPicker = true);
    try {
      final trip = await ref.read(tripsApiProvider).getDetail(record.tripId);
      if (!mounted) return;
      setState(() => _openingPicker = false);

      final added = await showRecordModeSheet(context, trip);
      if (!mounted) return;
      if (added) {
        await _load();
        ref.read(recordsListControllerProvider.notifier).load();
      }
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(() => _openingPicker = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error is ApiException ? error.message : '여행 정보를 불러오지 못했어요.')));
    }
  }

  /// 여행 대표사진 지정/해제(API 명세서 §2.6 PUT/DELETE /trips/{tripId}/cover).
  /// 이미 대표사진인 걸 다시 누르면 해제, 아니면 지정 — 트립당 대표사진은
  /// 하나뿐이라 새로 지정하면 서버가 기존 것을 알아서 덮어쓴다.
  Future<void> _toggleCover(RecordDetail record, RecordPhoto photo) async {
    setState(() => _togglingCoverPhotoId = photo.id);
    try {
      final api = ref.read(recordsApiProvider);
      if (photo.isCover) {
        await api.clearTripCover(record.tripId);
      } else {
        await api.setTripCover(record.tripId, photo.id);
      }
      if (!mounted) return;
      await _load();
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error is ApiException ? error.message : '대표사진 설정에 실패했어요.')),
      );
    } finally {
      if (mounted) setState(() => _togglingCoverPhotoId = null);
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
      _DetailLoaded(:final record) => _RecordDetailBody(
        record: record,
        togglingCoverPhotoId: _togglingCoverPhotoId,
        onToggleCover: (photo) => _toggleCover(record, photo),
        addingPhotos: _openingPicker,
        onAddPhotos: () => _addPhotos(record),
      ),
    };
  }
}

class _RecordDetailBody extends StatelessWidget {
  const _RecordDetailBody({
    required this.record,
    required this.togglingCoverPhotoId,
    required this.onToggleCover,
    required this.addingPhotos,
    required this.onAddPhotos,
  });

  final RecordDetail record;
  final String? togglingCoverPhotoId;
  final ValueChanged<RecordPhoto> onToggleCover;
  final bool addingPhotos;
  final VoidCallback onAddPhotos;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        if (record.photos.isNotEmpty) ...[
          const Text(
            '사진을 눌러 여행 대표사진으로 지정할 수 있어요',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.ink400),
          ),
          const SizedBox(height: 10),
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
              return _CoverablePhotoTile(
                photo: photo,
                toggling: togglingCoverPhotoId == photo.id,
                onTap: () => onToggleCover(photo),
              );
            },
          ),
        ] else
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
        const SizedBox(height: 12),
        AppButton(
          label: '사진 추가하기',
          variant: AppButtonVariant.outline,
          height: 40,
          loading: addingPhotos,
          onPressed: addingPhotos ? null : onAddPhotos,
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

class _CoverablePhotoTile extends StatelessWidget {
  const _CoverablePhotoTile({required this.photo, required this.toggling, required this.onTap});

  final RecordPhoto photo;
  final bool toggling;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: toggling ? null : onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.network(
              photo.storageUrl,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) => Container(color: AppColors.surfaceSubtle),
            ),
            if (photo.isCover)
              Container(
                decoration: BoxDecoration(border: Border.all(color: AppColors.lime, width: 3)),
              ),
            Positioned(
              top: 4,
              right: 4,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: const BoxDecoration(color: Color(0x99000000), shape: BoxShape.circle),
                child: toggling
                    ? const SizedBox(
                        width: 12,
                        height: 12,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Icon(
                        photo.isCover ? Icons.star : Icons.star_border,
                        color: photo.isCover ? AppColors.lime : Colors.white,
                        size: 16,
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
