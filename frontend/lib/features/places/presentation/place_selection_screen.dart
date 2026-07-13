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

/// 목록 행을 눌렀을 때 지도가 그 장소로 확대되는 줌 레벨(축척 확대, 요구사항 3).
const _focusZoom = 15.0;

/// API 명세서 §2.2 "카테고리 선택 시 지도에 마커로 필터링, 마커 클릭으로 선택".
/// 지도 위에 후보를 마커로 찍고, 하단에 드래그로 여닫는 목록 시트를 함께 둔다.
/// 시트를 위로 끌어올리면 목록이 지도를 덮고, 아래로 내리면 지도만 보인다.
///
/// 상호작용 규칙:
///  - 목록 행 탭 / 마커 탭: 지도를 그 장소로 확대 이동(선택은 바뀌지 않음).
///  - 목록 행 오른쪽 원 버튼: 선택 토글(선택된 곳은 초록 마커로 구분).
///  - 시트 크기 변경: 상단 핸들/헤더를 드래그할 때만. 목록 영역을 스와이프하면
///    시트 크기는 그대로 두고 관광지 목록만 스크롤된다.
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

  /// 지도를 해당 장소로 확대 이동한다(선택 상태는 건드리지 않음).
  void _focusPlace(PlaceCandidate candidate) {
    if (candidate.lat == null || candidate.lng == null) return;
    _mapController?.animateCamera(
      CameraUpdate.newLatLngZoom(LatLng(candidate.lat!, candidate.lng!), _focusZoom),
    );
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
            // 마커 탭은 선택 토글(API 명세서 §2.2 "마커 클릭으로 선택 가능").
            // 목록 행 탭은 지도 이동, 마커 탭은 선택 — 각자 반대편에서 하기 어려운
            // 동작을 맡는다(목록엔 선택 버튼이 따로 있고, 지도엔 그게 없으니 탭=선택).
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
            Positioned.fill(
              child: _PlaceSheet(
                candidates: _candidates,
                selectedIds: _selectedIds,
                loading: _loading,
                hasCtaPadding: _selectedIds.isNotEmpty,
                onRowTap: _focusPlace,
                onToggle: (candidate) => _toggleSelected(candidate.id),
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

/// 지도 위에 겹쳐 여닫는 관광지 목록.
///
/// 크기 조절과 목록 스크롤을 분리한다:
///  - 상단(핸들/헤더)을 세로로 드래그 → 시트 높이 변경(3단 스냅).
///  - 목록 영역 스와이프 → 시트 크기는 그대로, 관광지 목록만 자체 스크롤.
class _PlaceSheet extends StatefulWidget {
  const _PlaceSheet({
    required this.candidates,
    required this.selectedIds,
    required this.loading,
    required this.hasCtaPadding,
    required this.onRowTap,
    required this.onToggle,
  });

  final List<PlaceCandidate> candidates;
  final Set<String> selectedIds;
  final bool loading;
  final bool hasCtaPadding;
  final ValueChanged<PlaceCandidate> onRowTap;
  final ValueChanged<PlaceCandidate> onToggle;

  @override
  State<_PlaceSheet> createState() => _PlaceSheetState();
}

class _PlaceSheetState extends State<_PlaceSheet> {
  // 시트 높이 비율 스냅 3단계: 지도만(핸들만) / 반반 / 목록만(지도 덮음).
  static const double _min = 0.12;
  static const double _mid = 0.42;
  static const double _max = 0.92;
  static const List<double> _snaps = [_min, _mid, _max];

  double _extent = _mid;
  bool _dragging = false;
  final _listController = ScrollController();

  @override
  void dispose() {
    _listController.dispose();
    super.dispose();
  }

  void _onDragUpdate(DragUpdateDetails details, double maxHeight) {
    setState(() {
      _dragging = true;
      // 위로 끌면(delta 음수) 시트가 커진다.
      _extent = (_extent - details.primaryDelta! / maxHeight).clamp(_min, _max);
    });
  }

  void _onDragEnd(DragEndDetails details) {
    final velocity = details.primaryVelocity ?? 0;
    double target;
    if (velocity < -300) {
      // 빠르게 위로 → 한 단계 위 스냅.
      target = _snaps.firstWhere((s) => s > _extent + 0.001, orElse: () => _max);
    } else if (velocity > 300) {
      // 빠르게 아래로 → 한 단계 아래 스냅.
      target = _snaps.lastWhere((s) => s < _extent - 0.001, orElse: () => _min);
    } else {
      target = _nearestSnap(_extent);
    }
    setState(() {
      _dragging = false;
      _extent = target;
    });
  }

  double _nearestSnap(double value) =>
      _snaps.reduce((a, b) => (value - a).abs() < (value - b).abs() ? a : b);

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final maxHeight = constraints.maxHeight;
        return Align(
          alignment: Alignment.bottomCenter,
          child: AnimatedContainer(
            // 드래그 중엔 손가락을 즉시 따라오고, 손을 떼면 스냅 위치로 부드럽게 이동.
            duration: _dragging ? Duration.zero : const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            height: _extent * maxHeight,
            clipBehavior: Clip.antiAlias,
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
            child: Column(
              children: [
                // 상단 핸들/헤더 — 이 영역 드래그만 시트 크기를 바꾼다.
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onVerticalDragUpdate: (d) => _onDragUpdate(d, maxHeight),
                  onVerticalDragEnd: _onDragEnd,
                  child: Column(
                    children: [
                      const _SheetHandle(),
                      _SheetHeader(
                        total: widget.candidates.length,
                        selectedCount: widget.selectedIds.length,
                      ),
                    ],
                  ),
                ),
                // 목록 — 자체 스크롤 컨트롤러라 시트 크기와 독립적으로 스크롤된다.
                Expanded(
                  child: _buildList(),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildList() {
    if (widget.candidates.isEmpty) {
      final text = widget.loading ? '장소를 불러오는 중…' : '이 지역에서 찾은 장소가 없어';
      return ListView(
        controller: _listController,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 48),
            child: Center(
              child: Text(
                text,
                style: const TextStyle(color: AppColors.ink400, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      );
    }

    return ListView.builder(
      controller: _listController,
      padding: EdgeInsets.only(bottom: widget.hasCtaPadding ? 24 : 12),
      itemCount: widget.candidates.length,
      itemBuilder: (context, index) {
        final candidate = widget.candidates[index];
        return _PlaceListRow(
          candidate: candidate,
          selected: widget.selectedIds.contains(candidate.id),
          showDivider: index != widget.candidates.length - 1,
          onTap: () => widget.onRowTap(candidate),
          onToggle: () => widget.onToggle(candidate),
        );
      },
    );
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
    required this.onToggle,
  });

  final PlaceCandidate candidate;
  final bool selected;
  final bool showDivider;
  final VoidCallback onTap; // 행 탭 = 지도 확대 이동
  final VoidCallback onToggle; // 오른쪽 원 = 선택 토글

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 12, 12),
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
            // 선택 토글 버튼. 행 탭(지도 이동)과 분리하려고 별도 제스처로 감싸고
            // 패딩으로 탭 영역을 키운다 — 안쪽 제스처가 바깥 InkWell보다 먼저 탭을 가져간다.
            GestureDetector(
              onTap: onToggle,
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: _SelectionCircleValue(selected: selected),
              ),
            ),
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

/// design.md §5.7 체크서클. 선택됨 = ink900 배경 + 라임 체크, 미선택 = outline만.
class _SelectionCircleValue extends StatelessWidget {
  const _SelectionCircleValue({required this.selected});

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
