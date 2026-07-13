import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../data/places_api.dart';
import '../data/places_models.dart';

const _categoryFilters = <(String? value, String label)>[
  (null, '전체'),
  ('tourist_spot', '관광지'),
  ('restaurant', '맛집'),
  ('shopping', '쇼핑'),
];

/// 대한민국 중심 대략 좌표(초기 카메라). 후보가 로드되면 그 범위로 다시 맞춘다.
const _koreaCenter = CameraPosition(target: LatLng(36.5, 127.8), zoom: 6.5);

/// API 명세서 §2.2 "카테고리 선택 시 지도에 마커로 필터링, 마커 클릭으로 선택".
/// TourAPI 후보(§PlacesService)를 지도 위 마커로 찍고, 마커를 누르면 하단 카드가
/// 떠서 선택/해제할 수 있다. 선택된 마커는 초록으로 구분된다.
///
/// 카테고리 필터는 서버 재조회 방식이다(§category → TourAPI contentTypeId). 후보
/// DTO가 contentTypeId를 내려주지 않아 클라이언트 사이드 필터링(명세 §2.2, plan.md
/// Phase 7의 별도 항목)은 백엔드 DTO 변경이 선행돼야 하므로 이번 스코프에서 제외한다.
///
/// "N곳으로 최적 동선 짜기" CTA가 호출할 `POST /trips/{tripId}/schedule/generate`는
/// 아직 백엔드에 없다(plan.md Phase 8) — 지금은 선택 상태만 유지하고 CTA는 "곧
/// 만나요" 안내로 대체한다.
class PlaceSelectionScreen extends ConsumerStatefulWidget {
  const PlaceSelectionScreen({super.key, required this.tripId});

  final String tripId;

  @override
  ConsumerState<PlaceSelectionScreen> createState() => _PlaceSelectionScreenState();
}

class _PlaceSelectionScreenState extends ConsumerState<PlaceSelectionScreen> {
  List<PlaceCandidate> _candidates = const [];
  bool _loading = true;
  String? _error;
  String? _category;
  final Set<String> _selectedIds = {};
  PlaceCandidate? _tapped;
  GoogleMapController? _mapController;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _mapController?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final candidates = await ref
          .read(placesApiProvider)
          .getCandidates(widget.tripId, category: _category);
      if (!mounted) return;
      setState(() {
        _candidates = candidates;
        _loading = false;
      });
      _fitCamera();
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(() {
        _loading = false;
        _error = error is ApiException ? error.message : '네트워크 연결을 확인해줘';
      });
    }
  }

  void _selectCategory(String? category) {
    if (category == _category) return;
    setState(() {
      _category = category;
      _tapped = null;
    });
    _load();
  }

  void _toggleSelected(String placeId) {
    setState(() {
      if (!_selectedIds.remove(placeId)) {
        _selectedIds.add(placeId);
      }
    });
  }

  void _showComingSoon() {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('AI 동선 짜기는 곧 만나요 👋')));
  }

  /// 로드된 후보 전체가 화면에 들어오도록 카메라를 맞춘다.
  Future<void> _fitCamera() async {
    final controller = _mapController;
    if (controller == null) return;
    final coords = _candidates.where((c) => c.lat != null && c.lng != null).toList();
    if (coords.isEmpty) return;

    if (coords.length == 1) {
      await controller.animateCamera(
        CameraUpdate.newLatLngZoom(LatLng(coords.first.lat!, coords.first.lng!), 13),
      );
      return;
    }

    var minLat = coords.first.lat!, maxLat = coords.first.lat!;
    var minLng = coords.first.lng!, maxLng = coords.first.lng!;
    for (final c in coords) {
      minLat = min(minLat, c.lat!);
      maxLat = max(maxLat, c.lat!);
      minLng = min(minLng, c.lng!);
      maxLng = max(maxLng, c.lng!);
    }
    final bounds = LatLngBounds(
      southwest: LatLng(minLat, minLng),
      northeast: LatLng(maxLat, maxLng),
    );
    // 지도 레이아웃 직후 bounds 애니메이션이 간헐적으로 실패해 살짝 지연 후 호출한다.
    await Future.delayed(const Duration(milliseconds: 250));
    if (!mounted) return;
    await controller.animateCamera(CameraUpdate.newLatLngBounds(bounds, 60));
  }

  Set<Marker> _buildMarkers() {
    return {
      for (final c in _candidates)
        if (c.lat != null && c.lng != null)
          Marker(
            markerId: MarkerId(c.id),
            position: LatLng(c.lat!, c.lng!),
            icon: BitmapDescriptor.defaultMarkerWithHue(
              _selectedIds.contains(c.id)
                  ? BitmapDescriptor.hueGreen
                  : BitmapDescriptor.hueRose,
            ),
            onTap: () => setState(() => _tapped = c),
          ),
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.ink900),
        title: const Text(
          '가고 싶은 곳 골라봐',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.ink900),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            const SizedBox(height: 4),
            _CategoryChipRow(selected: _category, onSelect: _selectCategory),
            const SizedBox(height: 8),
            Expanded(
              child: Stack(
                children: [
                  GoogleMap(
                    initialCameraPosition: _koreaCenter,
                    markers: _buildMarkers(),
                    myLocationButtonEnabled: false,
                    zoomControlsEnabled: false,
                    onMapCreated: (controller) {
                      _mapController = controller;
                      _fitCamera();
                    },
                    // 지도 빈 곳을 누르면 열려 있던 정보 카드를 닫는다.
                    onTap: (_) {
                      if (_tapped != null) setState(() => _tapped = null);
                    },
                  ),
                  if (_loading)
                    const Positioned.fill(
                      child: ColoredBox(
                        color: Color(0x66FFFFFF),
                        child: Center(child: CircularProgressIndicator(color: AppColors.ink900)),
                      ),
                    ),
                  if (_error != null) _ErrorOverlay(message: _error!, onRetry: _load),
                  if (!_loading && _error == null && _candidates.isEmpty)
                    const _MapMessage(text: '이 지역에서 찾은 장소가 없어'),
                  if (_tapped != null)
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: _PlaceInfoCard(
                        candidate: _tapped!,
                        selected: _selectedIds.contains(_tapped!.id),
                        onToggle: () => _toggleSelected(_tapped!.id),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _selectedIds.isEmpty
          ? null
          : _FloatingCta(count: _selectedIds.length, onTap: _showComingSoon),
    );
  }
}

class _CategoryChipRow extends StatelessWidget {
  const _CategoryChipRow({required this.selected, required this.onSelect});

  final String? selected;
  final ValueChanged<String?> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 22),
        itemCount: _categoryFilters.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final (value, label) = _categoryFilters[index];
          final isSelected = value == selected;
          return InkWell(
            onTap: () => onSelect(value),
            borderRadius: BorderRadius.circular(999),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected ? AppColors.ink900 : AppColors.surfaceSubtle,
                borderRadius: BorderRadius.circular(999),
              ),
              alignment: Alignment.center,
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                  color: isSelected ? Colors.white : AppColors.ink600,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// 마커를 눌렀을 때 뜨는 장소 정보 카드. 우측 체크서클로 선택/해제한다.
class _PlaceInfoCard extends StatelessWidget {
  const _PlaceInfoCard({
    required this.candidate,
    required this.selected,
    required this.onToggle,
  });

  final PlaceCandidate candidate;
  final bool selected;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          _PlaceThumbnail(candidate: candidate, size: 56),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  candidate.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink900,
                  ),
                ),
                if (_subtitle(candidate) != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    _subtitle(candidate)!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.ink400,
                      height: 1.3,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          GestureDetector(
            onTap: onToggle,
            behavior: HitTestBehavior.opaque,
            child: _SelectionCircle(selected: selected),
          ),
        ],
      ),
    );
  }

  String? _subtitle(PlaceCandidate candidate) {
    final parts = <String>[];
    if (candidate.rating != null) {
      parts.add('★${candidate.rating!.toStringAsFixed(1)} (${candidate.reviewCount ?? 0})');
    }
    if (candidate.address != null) parts.add(candidate.address!);
    return parts.isEmpty ? null : parts.join(' · ');
  }
}

class _PlaceThumbnail extends StatelessWidget {
  const _PlaceThumbnail({required this.candidate, this.size = 44});

  final PlaceCandidate candidate;
  final double size;

  @override
  Widget build(BuildContext context) {
    final imageUrl = candidate.imageUrl;
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: size,
        height: size,
        color: AppColors.surfaceSubtle,
        alignment: Alignment.center,
        child: imageUrl == null
            ? Icon(Icons.place_outlined, color: AppColors.ink400, size: size * 0.45)
            : Image.network(
                imageUrl,
                fit: BoxFit.cover,
                width: size,
                height: size,
                errorBuilder: (_, _, _) =>
                    Icon(Icons.place_outlined, color: AppColors.ink400, size: size * 0.45),
              ),
      ),
    );
  }
}

/// design.md §5.7 체크서클. 선택됨 = ink900 배경 + 라임 체크, 미선택 = outline만.
class _SelectionCircle extends StatelessWidget {
  const _SelectionCircle({required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 30,
      height: 30,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: selected ? AppColors.ink900 : Colors.transparent,
        border: selected ? null : Border.all(color: AppColors.ink200, width: 1.8),
      ),
      child: selected ? const Icon(Icons.check, size: 17, color: AppColors.lime) : null,
    );
  }
}

class _MapMessage extends StatelessWidget {
  const _MapMessage({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(999),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 16),
          ],
        ),
        child: Text(
          text,
          style: const TextStyle(color: AppColors.ink600, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

class _ErrorOverlay extends StatelessWidget {
  const _ErrorOverlay({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        margin: const EdgeInsets.all(24),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 24),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.ink600, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            TextButton(onPressed: onRetry, child: const Text('다시 시도')),
          ],
        ),
      ),
    );
  }
}

class _FloatingCta extends StatelessWidget {
  const _FloatingCta({required this.count, required this.onTap});

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(22, 12, 22, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 28,
            offset: const Offset(0, -8),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: AppButton(
          label: '$count곳으로 최적 동선 짜기',
          variant: AppButtonVariant.lime,
          aiSparkle: true,
          onPressed: onTap,
        ),
      ),
    );
  }
}
