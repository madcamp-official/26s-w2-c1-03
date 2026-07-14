import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../../trips/data/trip_models.dart';
import '../data/photo_filter_pipeline.dart';
import '../data/photo_library_service.dart';
import 'record_upload_screen.dart';

/// "기록 시작" 진입점(기능명세서 §3.1 수용기준 2: 알림 클릭 또는 이 화면 진입
/// 시점에만 사진첩 조회가 발생해야 한다). 사진첩 접근 권한 요청과 필터링 실행이
/// 전부 이 화면의 버튼 탭에서만 트리거된다 — initState에서 자동 실행하지 않는다.
class RecordIntroScreen extends StatefulWidget {
  const RecordIntroScreen({super.key, required this.trip});

  final Trip trip;

  @override
  State<RecordIntroScreen> createState() => _RecordIntroScreenState();
}

class _RecordIntroScreenState extends State<RecordIntroScreen> {
  final _pipeline = PhotoFilterPipeline();
  bool _running = false;
  String? _errorText;

  @override
  void dispose() {
    _pipeline.dispose();
    super.dispose();
  }

  Future<void> _start({required bool useFallback}) async {
    setState(() {
      _running = true;
      _errorText = null;
    });

    final access = await _pipeline.requestAccess();
    if (!mounted) return;
    if (access == PhotoAccessResult.denied) {
      setState(() {
        _running = false;
        _errorText = '사진 보관함 접근 권한이 필요해요. 기기 설정에서 권한을 허용해주세요.';
      });
      return;
    }

    try {
      final result = useFallback
          ? await _pipeline.fallbackRecent(widget.trip)
          : await _pipeline.run(widget.trip);
      if (!mounted) return;
      setState(() => _running = false);
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => RecordUploadScreen(trip: widget.trip, result: result)),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _running = false;
        _errorText = '사진을 불러오지 못했어요. 다시 시도해주세요.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('여행 기록 시작', style: TextStyle(color: AppColors.ink900, fontWeight: FontWeight.w800)),
        iconTheme: const IconThemeData(color: AppColors.ink900),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${widget.trip.startDate} ~ ${widget.trip.endDate} 사진을 찾아볼게',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink900),
              ),
              const SizedBox(height: 8),
              const Text(
                '이 기간에 찍은 사진만 기기에서 확인해요. 사진 실물은 이 단계에서 서버로 전송되지 않아요.',
                style: TextStyle(fontSize: 13.5, height: 1.5, fontWeight: FontWeight.w600, color: AppColors.ink600),
              ),
              const SizedBox(height: 24),
              if (_errorText != null) ...[
                AppErrorBanner(message: _errorText!),
                const SizedBox(height: 16),
              ],
              const Spacer(),
              AppButton(
                label: '기록 시작',
                variant: AppButtonVariant.lime,
                aiSparkle: true,
                loading: _running,
                onPressed: () => _start(useFallback: false),
              ),
              const SizedBox(height: 10),
              AppButton(
                label: '필터 없이 최근 사진으로 진행',
                variant: AppButtonVariant.outline,
                loading: false,
                onPressed: _running ? null : () => _start(useFallback: true),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
