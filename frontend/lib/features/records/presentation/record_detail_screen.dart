import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_back_button.dart';
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
    } catch (_) {
      // DioException이 아닌 예외(응답 파싱 실패 등)까지 여기서 잡아야 화면이
      // 로딩 상태로 영원히 멈추지 않는다 — 실기기에서 실제로 겪었던 문제
      // (서버가 예상과 다른 응답을 줬을 때 화면이 그대로 멈춤).
      if (!mounted) return;
      setState(() => _state = const _DetailFailed('기록을 불러오지 못했어요. 다시 시도해주세요.'));
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
    } catch (_) {
      if (!mounted) return;
      setState(() => _deleting = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('삭제하지 못했어요.')));
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
    } catch (_) {
      if (!mounted) return;
      setState(() => _openingPicker = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('여행 정보를 불러오지 못했어요.')));
    }
  }

  /// 사진 한 장의 캡션 수정(API 명세서 §4 PATCH .../photos/{recordPhotoId}).
  Future<void> _editCaption(RecordDetail record, RecordPhoto photo) async {
    final controller = TextEditingController(text: photo.caption ?? '');
    final saved = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('캡션'),
        content: TextField(
          controller: controller,
          maxLength: 200,
          maxLines: 3,
          autofocus: true,
          decoration: const InputDecoration(hintText: '이 사진에 대한 한마디'),
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
    if (saved == null || !mounted || saved == (photo.caption ?? '')) return;

    try {
      await ref
          .read(recordsApiProvider)
          .updatePhotoCaption(record.tripId, record.id, photo.id, saved);
      if (!mounted) return;
      await _load();
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error is ApiException ? error.message : '캡션을 저장하지 못했어요.')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('캡션을 저장하지 못했어요.')));
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
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('대표사진 설정에 실패했어요.')));
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
        leading: const AppBackButton(),
        title: Text(
          state is _DetailLoaded ? state.record.tripCityName : '기록',
          style: const TextStyle(color: AppColors.ink900, fontWeight: FontWeight.w800),
        ),
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
        onEditCaption: (photo) => _editCaption(record, photo),
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
    required this.onEditCaption,
    required this.addingPhotos,
    required this.onAddPhotos,
  });

  final RecordDetail record;
  final String? togglingCoverPhotoId;
  final ValueChanged<RecordPhoto> onToggleCover;
  final ValueChanged<RecordPhoto> onEditCaption;
  final bool addingPhotos;
  final VoidCallback onAddPhotos;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        if (record.photos.isNotEmpty) ...[
          const Text(
            '사진을 눌러 여행 대표사진으로, 캡션을 눌러 글을 남겨보세요',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.ink400),
          ),
          const SizedBox(height: 12),
          for (final photo in record.photos) ...[
            _PhotoWithCaptionTile(
              photo: photo,
              toggling: togglingCoverPhotoId == photo.id,
              onToggleCover: () => onToggleCover(photo),
              onEditCaption: () => onEditCaption(photo),
            ),
            const SizedBox(height: 24),
          ],
          AppButton(
            label: '사진 추가하기',
            variant: AppButtonVariant.outline,
            height: 40,
            loading: addingPhotos,
            onPressed: addingPhotos ? null : onAddPhotos,
          ),
        ] else
          _EmptyPhotosState(loading: addingPhotos, onAddPhotos: onAddPhotos),
      ],
    );
  }
}

/// 인스타그램 피드처럼 사진 한 장 아래에 그 사진의 캡션을 바로 보여준다 —
/// 사진 탭은 기존 대표사진 지정/해제(§2.6), 캡션 영역 탭은 그 사진만의
/// 캡션 입력/수정으로 서로 다른 액션이라 영역을 분리했다.
class _PhotoWithCaptionTile extends StatelessWidget {
  const _PhotoWithCaptionTile({
    required this.photo,
    required this.toggling,
    required this.onToggleCover,
    required this.onEditCaption,
  });

  final RecordPhoto photo;
  final bool toggling;
  final VoidCallback onToggleCover;
  final VoidCallback onEditCaption;

  @override
  Widget build(BuildContext context) {
    final caption = photo.caption;
    final hasCaption = caption != null && caption.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: toggling ? null : onToggleCover,
          child: AspectRatio(
            aspectRatio: 4 / 3,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.network(
                    photo.storageUrl,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) =>
                        Container(color: AppColors.surfaceSubtle),
                  ),
                  if (photo.isCover)
                    Container(
                      decoration: BoxDecoration(border: Border.all(color: AppColors.lime, width: 3)),
                    ),
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Container(
                      padding: const EdgeInsets.all(5),
                      decoration: const BoxDecoration(color: Color(0x99000000), shape: BoxShape.circle),
                      child: toggling
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : Icon(
                              photo.isCover ? Icons.star : Icons.star_border,
                              color: photo.isCover ? AppColors.lime : Colors.white,
                              size: 18,
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        GestureDetector(
          onTap: onEditCaption,
          behavior: HitTestBehavior.opaque,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                hasCaption ? Icons.edit_note : Icons.add_comment_outlined,
                size: 16,
                color: AppColors.ink400,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  hasCaption ? caption : '캡션을 남겨보세요',
                  style: TextStyle(
                    fontSize: 13.5,
                    height: 1.4,
                    fontWeight: FontWeight.w500,
                    color: hasCaption ? AppColors.ink600 : AppColors.ink400,
                    fontStyle: hasCaption ? FontStyle.normal : FontStyle.italic,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _EmptyPhotosState extends StatelessWidget {
  const _EmptyPhotosState({required this.loading, required this.onAddPhotos});

  final bool loading;
  final VoidCallback onAddPhotos;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 32),
        Container(
          width: 96,
          height: 96,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: AppColors.surfaceSubtle, shape: BoxShape.circle),
          child: const Icon(Icons.image_outlined, size: 40, color: AppColors.ink300),
        ),
        const SizedBox(height: 20),
        const Text(
          '아직 기록이 없어요',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink900),
        ),
        const SizedBox(height: 6),
        const Text(
          '첫 사진을 올리고\n여행의 첫 페이지를 시작해보세요',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, height: 1.5, fontWeight: FontWeight.w600, color: AppColors.ink400),
        ),
        const SizedBox(height: 24),
        AppButton(
          label: '+  사진 추가하기',
          variant: AppButtonVariant.lime,
          loading: loading,
          onPressed: loading ? null : onAddPhotos,
        ),
        const SizedBox(height: 32),
      ],
    );
  }
}
