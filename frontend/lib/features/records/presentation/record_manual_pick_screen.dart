import 'package:flutter/material.dart';
import 'package:photo_manager/photo_manager.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../../trips/data/trip_models.dart';
import '../data/exif_location_service.dart';
import '../data/photo_filter_pipeline.dart';
import '../data/photo_library_service.dart';
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

/// "사용자 직접 선택" 모드의 진입 화면 — 온디바이스 1차 필터(흔들림/노출/중복/
/// OCR/얼굴감지) 없이 여행 기간 내 사진첩 전체를 그대로 보여주고 사용자가 직접
/// 고르게 한다(기능명세서 §8.1의 "기록 시작 시점에만 조회" 원칙은 이 화면
/// 진입 자체가 그 시점이라 동일하게 지킨다). 고른 뒤 EXIF/지명은 선택된
/// 사진에 한해서만 추출한다 — 전체 사진에 미리 돌리면 느리고 원본 좌표를
/// 불필요하게 많이 만지게 된다.
class RecordManualPickScreen extends StatefulWidget {
  const RecordManualPickScreen({super.key, required this.trip});

  final Trip trip;

  @override
  State<RecordManualPickScreen> createState() => _RecordManualPickScreenState();
}

class _RecordManualPickScreenState extends State<RecordManualPickScreen> {
  final _libraryService = PhotoLibraryService();
  final _exifLocationService = ExifLocationService();
  _PickState _state = const _PickLoading();
  final Set<String> _selectedIds = {};
  bool _preparing = false;

  @override
  void initState() {
    super.initState();
    _load();
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

    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => RecordUploadScreen(
          trip: widget.trip,
          result: PhotoFilterResult(candidates: candidates, totalScanned: assets.length),
          useAiCurate: false,
        ),
      ),
    );
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
