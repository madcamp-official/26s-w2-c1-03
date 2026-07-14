import 'package:flutter/material.dart';
import 'package:photo_manager/photo_manager.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../../trips/data/trip_models.dart';
import '../data/exif_location_service.dart';
import '../data/photo_candidate.dart';
import '../data/photo_filter_pipeline.dart';
import '../data/photo_library_service.dart';
import '../data/sensitive_content_detector.dart';
import 'record_upload_screen.dart';
import 'widgets/local_asset_thumbnail.dart';

const _maxSelectable = 100;

sealed class _PickState {
  const _PickState();
}

class _PickLoading extends _PickState {
  const _PickLoading();
}

class _PickFailed extends _PickState {
  const _PickFailed(this.message);
  final String message;
}

class _PickLoaded extends _PickState {
  const _PickLoaded(this.assets);
  final List<AssetEntity> assets;
}

/// "사용자 직접 선택" 모드의 진입 화면 — 온디바이스 1차 필터 중 흔들림/노출/
/// 중복/얼굴감지는 취향 문제라 생략하지만(사용자가 직접 고른 사진이니 존중),
/// 문서(여권/신분증/카드) 자동 제외(§8.4)만은 개인정보 안전장치라 이 모드에도
/// 그대로 적용한다 — 선택 직후 조용히 걸러내고 사용자에게 알린다.
/// 사진첩 조회 자체는(§8.1 "기록 시작 시점에만 조회") 이 화면 진입이 그 시점.
class RecordManualPickScreen extends StatefulWidget {
  const RecordManualPickScreen({super.key, required this.trip});

  final Trip trip;

  @override
  State<RecordManualPickScreen> createState() => _RecordManualPickScreenState();
}

class _RecordManualPickScreenState extends State<RecordManualPickScreen> {
  final _libraryService = PhotoLibraryService();
  final _exifLocationService = ExifLocationService();
  final _sensitiveContentDetector = SensitiveContentDetector();
  _PickState _state = const _PickLoading();
  final Set<String> _selectedIds = {};
  bool _preparing = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _sensitiveContentDetector.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _state = const _PickLoading());
    final access = await _libraryService.requestAccess();
    if (!mounted) return;
    if (access == PhotoAccessResult.denied) {
      setState(
        () => _state = const _PickFailed('사진 보관함 접근 권한이 필요해요. 기기 설정에서 권한을 허용해주세요.'),
      );
      return;
    }

    try {
      final assets = await _libraryService.queryByDateRange(
        start: DateTime.parse(widget.trip.startDate),
        end: DateTime.parse(widget.trip.endDate),
      );
      if (!mounted) return;
      setState(() => _state = _PickLoaded(assets));
    } catch (_) {
      if (!mounted) return;
      setState(() => _state = const _PickFailed('사진을 불러오지 못했어요.'));
    }
  }

  void _toggle(AssetEntity asset) {
    setState(() {
      if (!_selectedIds.remove(asset.id)) {
        if (_selectedIds.length >= _maxSelectable) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('최대 100장까지 선택할 수 있어요.')));
          return;
        }
        _selectedIds.add(asset.id);
      }
    });
  }

  Future<void> _proceed(List<AssetEntity> assets) async {
    if (_selectedIds.isEmpty || _preparing) return;

    setState(() => _preparing = true);
    final selected = assets.where((a) => _selectedIds.contains(a.id)).toList();
    // 선택된 것만 EXIF/역지오코딩 — 원본 좌표는 여기서만 잠깐 쓰이고 파기된다(§8.2).
    final candidates = await Future.wait(selected.map(_exifLocationService.buildCandidate));
    if (!mounted) return;

    final filtered = await _excludeDocuments(candidates);
    if (!mounted) return;

    if (filtered.isEmpty) {
      setState(() => _preparing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('선택한 사진이 전부 문서로 보여 제외됐어요. 다른 사진을 골라주세요.')),
      );
      return;
    }
    if (filtered.length < candidates.length) {
      final excludedCount = candidates.length - filtered.length;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('문서로 보이는 사진 $excludedCount장은 자동으로 제외했어요.')));
    }

    // push(+ 결과 전달 후 스스로 pop)로 체인을 만든다 — pushReplacement를 쓰면
    // 이 화면이 스택에서 사라져서, 맨 끝(finalize)에서 원래 호출한 화면까지
    // 같이 닫혀버린다.
    final success = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => RecordUploadScreen(
          trip: widget.trip,
          result: PhotoFilterResult(candidates: filtered, totalScanned: assets.length),
          useAiCurate: false,
        ),
      ),
    );
    if (!mounted) return;
    Navigator.of(context).pop(success);
  }

  /// 여권/신분증/카드 등 문서성 사진 자동 제외(§8.4) — 직접 선택 모드에서도
  /// 유일하게 유지하는 온디바이스 안전장치. 선택된(최대 100장) 것에만 돌려서
  /// 전체 사진첩에 미리 돌리는 비용을 피한다.
  Future<List<PhotoCandidate>> _excludeDocuments(List<PhotoCandidate> candidates) async {
    final kept = <PhotoCandidate>[];
    for (final candidate in candidates) {
      final file = await candidate.asset.file;
      if (file == null) {
        kept.add(candidate); // 원본 파일을 못 읽으면(드묾) 안전하게 통과시킨다.
        continue;
      }
      final isDocument = await _sensitiveContentDetector.isDocument(file.path);
      if (!isDocument) kept.add(candidate);
    }
    return kept;
  }

  @override
  Widget build(BuildContext context) {
    final state = _state;
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('사진 고르기', style: TextStyle(color: AppColors.ink900, fontWeight: FontWeight.w800)),
        iconTheme: const IconThemeData(color: AppColors.ink900),
      ),
      body: SafeArea(child: _buildBody(state)),
    );
  }

  Widget _buildBody(_PickState state) {
    return switch (state) {
      _PickLoading() => const Center(child: CircularProgressIndicator(color: AppColors.ink900)),
      _PickFailed(:final message) => Center(
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
      _PickLoaded(:final assets) when assets.isEmpty => const Center(
        child: Text(
          '이 여행 기간에 찍힌 사진이 없어요',
          style: TextStyle(color: AppColors.ink400, fontWeight: FontWeight.w600),
        ),
      ),
      _PickLoaded(:final assets) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '${_selectedIds.length} / $_maxSelectable장 선택됨',
                style: const TextStyle(fontSize: 12, color: AppColors.ink400, fontWeight: FontWeight.w600),
              ),
            ),
          ),
          Expanded(
            child: GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
              ),
              itemCount: assets.length,
              itemBuilder: (context, index) {
                final asset = assets[index];
                final selected = _selectedIds.contains(asset.id);
                return GestureDetector(
                  onTap: () => _toggle(asset),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        LocalAssetThumbnail(asset: asset),
                        if (!selected) Container(color: const Color(0x66FFFFFF)),
                        Positioned(
                          top: 4,
                          right: 4,
                          child: Icon(
                            selected ? Icons.check_circle : Icons.radio_button_unchecked,
                            color: selected ? AppColors.lime : Colors.white,
                            size: 20,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: AppButton(
              label: _selectedIds.isEmpty ? '사진을 선택해주세요' : '${_selectedIds.length}장 업로드하기',
              variant: AppButtonVariant.lime,
              loading: _preparing,
              onPressed: _selectedIds.isEmpty ? null : () => _proceed(assets),
            ),
          ),
        ],
      ),
    };
  }
}
