import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/date_format.dart';
import '../../../core/widgets/app_button.dart';
import '../../trips/data/trip_models.dart';
import '../data/photo_filter_pipeline.dart';
import '../data/photo_library_service.dart';
import 'record_upload_screen.dart';

/// "AI가 사진 골라줄게"/"필터 없이 최근 사진으로 진행" 선택 직후 자동 실행되는
/// 진행 화면(기능명세서 §3.1 수용기준 2: 사진첩 조회는 이 트리거 시점에만
/// 발생). 화면 진입 자체가 실행 신호라 버튼 없이 바로 시작하고, 끝나면
/// RecordUploadScreen으로 자동 전환한다.
class RecordFilterRunScreen extends StatefulWidget {
  const RecordFilterRunScreen({super.key, required this.trip, required this.useFallback});

  final Trip trip;
  final bool useFallback;

  @override
  State<RecordFilterRunScreen> createState() => _RecordFilterRunScreenState();
}

class _RecordFilterRunScreenState extends State<RecordFilterRunScreen> {
  final _pipeline = PhotoFilterPipeline();
  String _statusLabel = '사진 보관함 접근 권한을 확인하는 중...';
  String? _errorText;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _run());
  }

  @override
  void dispose() {
    _pipeline.dispose();
    super.dispose();
  }

  Future<void> _run() async {
    setState(() {
      _errorText = null;
      _statusLabel = '사진 보관함 접근 권한을 확인하는 중...';
    });

    final access = await _pipeline.requestAccess();
    if (!mounted) return;
    if (access == PhotoAccessResult.denied) {
      setState(() => _errorText = '사진 보관함 접근 권한이 필요해요. 기기 설정에서 권한을 허용해주세요.');
      return;
    }

    setState(
      () => _statusLabel = '${formatTripDateRange(widget.trip.startDate, widget.trip.endDate)} 사진을 찾는 중...',
    );
    try {
      final result = widget.useFallback
          ? await _pipeline.fallbackRecent(widget.trip)
          : await _pipeline.run(widget.trip);
      if (!mounted) return;
      // push(+ 결과 전달 후 스스로 pop)로 체인을 만든다 — pushReplacement를 쓰면
      // 이 화면이 스택에서 사라져서, 맨 끝(finalize)에서 원래 호출한 화면까지
      // 같이 닫혀버리는 문제가 생긴다(호출부가 몇 단계 위인지와 무관하게 항상
      // "한 화면만 정리하고 원위치로" 돌아가려면 push+pop 체인이 맞다).
      final success = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => RecordUploadScreen(trip: widget.trip, result: result, useAiCurate: true),
        ),
      );
      if (!mounted) return;
      Navigator.of(context).pop(success);
    } catch (_) {
      if (!mounted) return;
      setState(() => _errorText = '사진을 불러오지 못했어요. 다시 시도해주세요.');
    }
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
                  const SizedBox(
                    width: 44,
                    height: 44,
                    child: CircularProgressIndicator(strokeWidth: 3, color: AppColors.ink900),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    _statusLabel,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink900),
                  ),
                ] else ...[
                  AppErrorBanner(message: _errorText!),
                  const SizedBox(height: 16),
                  AppButton(label: '다시 시도', onPressed: _run),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
