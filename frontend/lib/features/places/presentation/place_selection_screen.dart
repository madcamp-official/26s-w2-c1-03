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
/// 지도 위에 후보를 마커로 찍고, 하단에 드래그로 여닫는 목록 시트를 함께 둔다.
/// 시트를 위로 끌어올리면 목록이 지도를 덮고, 아래로 내리면 지도만 보인다.
/// 마커 탭 / 목록 행 탭 모두 선택을 토글하며, 선택된 곳은 초록 마커로 구분된다.
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
    setState(() => _category = category);
    _load();
  }

  void _toggleSelected(String placeId) {
    setState(() {
      if (!_selectedIds.remove(placeId)) {
        _selectedIds.add(placeId);
      }
    });
  }

  /// 목록 행을 누르면 선택을 토글하고 지도를 그 장소로 이동시킨다.
  void _onRowTap(PlaceCandidate candidate) {
    _toggleSelected(candidate.id);
    if (candidate.lat != null && candidate.lng != null) {
      _mapController?.animateCamera(
        CameraUpdate.newLatLng(LatLng(candidate.lat!, candidate.lng!)),
      );
    }
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
            onTap: () => _toggleSelected(c.id),
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
        child: Stack(
          children: [
            GoogleMap(
              initialCameraPosition: _koreaCenter,
              markers: _buildMarkers(),
              myLocationButtonEnabled: false,
              zoomControlsEnabled: false,
              // 시트에 가려지지 않게 구글 로고/저작권 표시를 위로 띄운다.
              padding: const EdgeInsets.only(bottom: 90),
              onMapCreated: (controller) {
                _mapController = controller;
                _fitCamera();
              },
            ),
            // 카테고리 필터 — 지도 위 상단 오버레이(칩 배경이 불투명해 지도 위에서도 잘 보인다).
            Positioned(
              top: 8,
              left: 0,
              right: 0,
              child: _CategoryChipRow(selected: _category, onSelect: _selectCategory),
            ),
            if (_loading && _candidates.isEmpty)
              const Positioned.fill(
                child: ColoredBox(
                  color: Color(0x66FFFFFF),
                  child: Center(child: CircularProgressIndicator(color: AppColors.ink900)),
                ),
              ),
            if (_error != null && _candidates.isEmpty)
              _ErrorOverlay(message: _error!, onRetry: _load),
            // 하단 드래그 목록 시트.
            _PlaceSheet(
              candidates: _candidates,
              selectedIds: _selectedIds,
              loading: _loading,
              hasCtaPadding: _selectedIds.isNotEmpty,
              onRowTap: _onRowTap,
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

/// 지도 위에 겹쳐 여닫는 관광지 목록. 위로 끌면 지도를 덮고(목록만), 아래로 내리면
/// 지도만 보인다(핸들만 남음). 시트 전체가 하나의 스크롤뷰라 어디를 잡아 끌든 여닫힌다.
class _PlaceSheet extends StatelessWidget {
  const _PlaceSheet({
    required this.candidates,
    required this.selectedIds,
    required this.loading,
    required this.hasCtaPadding,
    required this.onRowTap,
  });

  final List<PlaceCandidate> candidates;
  final Set<String> selectedIds;
  final bool loading;
  final bool hasCtaPadding;
  final ValueChanged<PlaceCandidate> onRowTap;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.4,
      minChildSize: 0.12,
      maxChildSize: 0.92,
      snap: true,
      snapSizes: const [0.12, 0.4, 0.92],
      builder: (context, scrollController) {
        return DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 24,
                offset: const Offset(0, -6),
              ),
            ],
          ),
          child: ListView(
            controller: scrollController,
            padding: EdgeInsets.only(bottom: hasCtaPadding ? 24 : 12),
            children: [
              const _SheetHandle(),
              _SheetHeader(total: candidates.length, selectedCount: selectedIds.length),
              ..._buildRows(context),
            ],
          ),
        );
      },
    );
  }

  List<Widget> _buildRows(BuildContext context) {
    if (candidates.isEmpty) {
      final text = loading
          ? '장소를 불러오는 중…'
          : '이 지역에서 찾은 장소가 없어';
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 48),
          child: Center(
            child: Text(
              text,
              style: const TextStyle(color: AppColors.ink400, fontWeight: FontWeight.w600),
            ),
          ),
        ),
      ];
    }

    return [
      for (var i = 0; i < candidates.length; i++)
        _PlaceListRow(
          candidate: candidates[i],
          selected: selectedIds.contains(candidates[i].id),
          showDivider: i != candidates.length - 1,
          onTap: () => onRowTap(candidates[i]),
        ),
    ];
  }
}

class _SheetHandle extends StatelessWidget {
  const _SheetHandle();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        margin: const EdgeInsets.only(top: 10, bottom: 6),
        width: 40,
        height: 4,
        decoration: BoxDecoration(
          color: AppColors.border,
          borderRadius: BorderRadius.circular(999),
        ),
      ),
    );
  }
}

class _SheetHeader extends StatelessWidget {
  const _SheetHeader({required this.total, required this.selectedCount});

  final int total;
  final int selectedCount;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            '관광지 $total곳',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink900),
          ),
          if (selectedCount > 0)
            Text(
              '$selectedCount곳 선택',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppColors.green800,
              ),
            ),
        ],
      ),
    );
  }
}

class _PlaceListRow extends StatelessWidget {
  const _PlaceListRow({
    required this.candidate,
    required this.selected,
    required this.showDivider,
    required this.onTap,
  });

  final PlaceCandidate candidate;
  final bool selected;
  final bool showDivider;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        decoration: BoxDecoration(
          border: showDivider
              ? const Border(bottom: BorderSide(color: AppColors.border, width: 1))
              : null,
        ),
        child: Row(
          children: [
            _PlaceThumbnail(candidate: candidate, size: 48),
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
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink900,
                    ),
                  ),
                  if (_subtitle(candidate) != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      _subtitle(candidate)!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink400,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 10),
            _SelectionCircle(selected: selected),
          ],
        ),
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
                color: isSelected ? AppColors.ink900 : Colors.white,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: isSelected ? AppColors.ink900 : AppColors.border,
                  width: 1,
                ),
                boxShadow: [
                  BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 8),
                ],
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
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: selected ? AppColors.ink900 : Colors.transparent,
        border: selected ? null : Border.all(color: AppColors.ink200, width: 1.8),
      ),
      child: selected ? const Icon(Icons.check, size: 16, color: AppColors.lime) : null,
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
