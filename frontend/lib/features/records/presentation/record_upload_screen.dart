import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../../auth/presentation/login_controller.dart' show apiClientProvider;
import '../../trips/data/trip_models.dart';
import '../data/photo_candidate.dart';
import '../data/photo_filter_pipeline.dart';
import '../data/photo_upload_service.dart';
import '../data/records_api.dart';
import 'record_manual_caption_screen.dart';
import 'record_selection_screen.dart';

final recordsApiProvider = Provider<RecordsApi>((ref) => RecordsApi(ref.watch(apiClientProvider)));

const _uploadBatchSize = 10;

/// 세션 시작 → 메타데이터 등록 → 실물 업로드(EXIF 스트립 후 배치 전송) →
/// (AI 모드일 때만) curate 순서로 BE 파이프라인을 그대로 밟는다(API 명세서 §4).
/// 이 화면 진입 자체가 파이프라인 실행 트리거다 — RecordIntroScreen/
/// RecordManualPickScreen에서 이미 사용자 동의(또는 직접 선택)를 받은 뒤라
/// 여기서 추가 확인 없이 바로 시작한다.
///
/// [useAiCurate]가 true면 기존 AI 추천 경로(curate → RecordSelectionScreen),
/// false면 사용자가 이미 직접 고른 사진 그대로 캡션 화면(RecordManualCaptionScreen)
/// 으로 넘어간다 — curate를 호출하지 않으므로 BE에도 UPLOADED 상태 그대로 finalize
/// 가능해야 한다(RecordsService.finalize가 RECOMMENDED/UPLOADED 둘 다 받는 이유).
class RecordUploadScreen extends ConsumerStatefulWidget {
  const RecordUploadScreen({
    super.key,
    required this.trip,
    required this.result,
    required this.useAiCurate,
  });

  final Trip trip;
  final PhotoFilterResult result;
  final bool useAiCurate;

  @override
  ConsumerState<RecordUploadScreen> createState() => _RecordUploadScreenState();
}

class _RecordUploadScreenState extends ConsumerState<RecordUploadScreen> {
  String _statusLabel = '기록 세션을 시작하는 중...';
  double? _progress;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _runPipeline());
  }

  Future<void> _runPipeline() async {
    setState(() {
      _statusLabel = '기록 세션을 시작하는 중...';
      _progress = null;
      _errorText = null;
    });

    final api = ref.read(recordsApiProvider);
    final uploadService = PhotoUploadService();

    try {
      final recordId = await api.startSession(widget.trip.id);
      if (!mounted) return;

      if (widget.result.candidates.isEmpty) {
        // 후보가 아예 없으면 업로드/curate를 건너뛰고 바로 다음 화면(빈 상태)으로.
        _goToNext(recordId, const {});
        return;
      }

      setState(() => _statusLabel = '사진 정보를 등록하는 중...');
      final refByLocalId = await api.registerMetadata(widget.trip.id, recordId, [
        for (final c in widget.result.candidates)
          (localId: c.localId, takenAt: c.takenAt, locationName: c.locationName),
      ]);
      if (!mounted) return;

      final candidateByRefId = {
        for (final c in widget.result.candidates)
          if (refByLocalId[c.localId] != null) refByLocalId[c.localId]!: c,
      };
      final refIds = candidateByRefId.keys.toList();

      setState(() {
        _statusLabel = '사진 업로드 중';
        _progress = 0;
      });

      var uploadedCount = 0;
      for (var i = 0; i < refIds.length; i += _uploadBatchSize) {
        final batch = refIds.sublist(i, min(i + _uploadBatchSize, refIds.length));
        final files = <String, List<int>>{};
        for (final refId in batch) {
          final bytes = await uploadService.prepareBytes(candidateByRefId[refId]!.asset);
          if (bytes != null) files[refId] = bytes;
        }
        if (files.isNotEmpty) {
          await api.uploadPhotos(widget.trip.id, recordId, files);
        }
        if (!mounted) return;
        uploadedCount += batch.length;
        setState(() => _progress = uploadedCount / refIds.length);
      }

      if (widget.useAiCurate) {
        setState(() {
          _statusLabel = 'AI가 베스트 컷을 고르는 중...';
          _progress = null;
        });
        await api.curate(widget.trip.id, recordId);
        if (!mounted) return;
      }

      _goToNext(recordId, candidateByRefId);
    } catch (_) {
      if (!mounted) return;
      setState(() => _errorText = '진행 중 문제가 발생했어요. 다시 시도해주세요.');
    }
  }

  void _goToNext(String recordId, Map<String, PhotoCandidate> candidateByRefId) {
    final next = widget.useAiCurate
        ? RecordSelectionScreen(tripId: widget.trip.id, recordId: recordId)
        : RecordManualCaptionScreen(
            tripId: widget.trip.id,
            recordId: recordId,
            candidatesByRefId: candidateByRefId,
          );
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => next));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(22),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_errorText == null) ...[
                  SizedBox(
                    width: 44,
                    height: 44,
                    child: CircularProgressIndicator(
                      value: _progress,
                      strokeWidth: 3,
                      color: AppColors.ink900,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    _statusLabel,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink900),
                  ),
                  if (_progress != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      '${(_progress! * 100).round()}%',
                      style: const TextStyle(fontSize: 12.5, color: AppColors.ink400, fontWeight: FontWeight.w600),
                    ),
                  ],
                ] else ...[
                  AppErrorBanner(message: _errorText!),
                  const SizedBox(height: 16),
                  AppButton(label: '다시 시도', onPressed: _runPipeline),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
