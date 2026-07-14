import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../data/places_api.dart';
import '../data/places_models.dart';
import '../../schedule/data/schedule_api.dart';
import '../../schedule/presentation/schedule_generating_screen.dart';
import 'place_selection_constants.dart';
import 'widgets/category_chip_row.dart';
import 'widgets/place_error_overlay.dart';
import 'widgets/place_floating_cta.dart';
import 'widgets/place_search_bar.dart';
import 'widgets/place_sheet.dart';

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
/// 최초에는 카테고리 없이 전체 후보 30곳을 받아 둔다. 카테고리를 선택하면 전체
/// 후보 안의 해당 카테고리를 먼저 보여주고, 부족한 수량은 카테고리 전용 후보
/// 조회 결과를 합쳐 30곳까지 채운다. 카테고리별 추가 조회는 한 번만 수행하고
/// 캐시에 보관해 같은 칩을 다시 눌러도 서버를 재호출하지 않는다.
///
/// "N곳으로 최적 동선 짜기" CTA가 호출할 `POST /trips/{tripId}/schedule/generate`는
/// 아직 백엔드에 없다(plan.md Phase 8) — 지금은 선택 상태만 유지하고 CTA는 "곧
/// 만나요" 안내로 대체한다.
class PlaceSelectionScreen extends ConsumerStatefulWidget {
  const PlaceSelectionScreen({
    super.key,
    required this.tripId,
    required this.startDate,
    required this.endDate,
  });

  final String tripId;
  /// 여행 시작/종료일("yyyy-MM-dd") — 날짜 배지에 쓸 여행 일수를 계산하는 데 쓴다.
  final String startDate;
  final String endDate;

  @override
  ConsumerState<PlaceSelectionScreen> createState() =>
      _PlaceSelectionScreenState();
}

class _PlaceSelectionScreenState extends ConsumerState<PlaceSelectionScreen> {
  List<PlaceCandidate> _allCandidates = const [];
  bool _loading = true;
  String? _error;
  String? _category;
  final Map<String, List<PlaceCandidate>> _categoryCandidates = {};
  final Set<String> _loadingCategoryCandidates = {};
  final Map<String, PlaceCandidate> _selectedCandidates = {};
  final Map<String, int> _selectedDayNumbers = {};
  GoogleMapController? _mapController;
  bool _generating = false;

  /// 여행 일수(최소 1일). 백엔드 computeDurationDays와 동일한 로직(포함 일수).
  int get _dayCount {
    final start = DateTime.parse(widget.startDate);
    final end = DateTime.parse(widget.endDate);
    final days = end.difference(start).inDays + 1;
    return days < 1 ? 1 : days;
  }

  // 검색 상태. _searchMode면 _allCandidates가 지역 후보가 아니라 검색 결과다.
  final _searchController = TextEditingController();
  bool _searchMode = false;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _mapController?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // 카테고리 없이 전체 30곳을 먼저 받아 두고, 카테고리 선택 시 부족분만 추가 조회한다.
      final candidates = await ref
          .read(placesApiProvider)
          .getCandidates(widget.tripId);
      if (!mounted) return;
      setState(() {
        _allCandidates = candidates;
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
    if (category == _category) {
      if (category != null) {
        _loadCategoryCandidates(category);
      }
      return;
    }
    setState(() => _category = category);
    _fitCamera();
    if (category != null) {
      _loadCategoryCandidates(category);
    }
  }

  /// 하단 목록 헤더에 쓸 현재 카테고리 라벨. '전체'는 여러 종류가 섞이므로 '장소'로 쓴다.
  String _categoryLabel(String? category) {
    if (category == null) return '장소';
    return categoryFilters.firstWhere((f) => f.$1 == category).$2;
  }

  /// 화면에 보여줄 후보. 검색 중이거나 '전체'면 전량, 카테고리가 선택되면
  /// 전체 후보 중 해당 카테고리를 먼저 쓰고 카테고리 전용 조회 결과를 합쳐 30곳까지 채운다.
  List<PlaceCandidate> get _visibleCandidates {
    if (_searchMode || _category == null) return _allCandidates;
    final wanted = categoryContentTypeIds[_category];
    if (wanted == null) return _allCandidates;
    return _dedupeCandidates([
      ..._allCandidates.where((c) => c.contentTypeId == wanted),
      ...?_categoryCandidates[_category],
    ]).take(candidatePageSize).toList();
  }

  Set<String> get _selectedIds => _selectedCandidates.keys.toSet();

  /// 지도에 보여줄 후보. 현재 카테고리 후보에 이미 선택한 장소를 합쳐,
  /// 선택된 곳은 카테고리 필터와 관계없이 계속 지도에서 볼 수 있게 한다.
  List<PlaceCandidate> get _markerCandidates {
    final byId = <String, PlaceCandidate>{
      for (final candidate in _visibleCandidates) candidate.id: candidate,
    };
    byId.addAll(_selectedCandidates);
    return byId.values.toList();
  }

  List<PlaceCandidate> _dedupeCandidates(Iterable<PlaceCandidate> candidates) {
    final byId = <String, PlaceCandidate>{};
    for (final candidate in candidates) {
      byId.putIfAbsent(candidate.id, () => candidate);
    }
    return byId.values.toList();
  }

  Future<void> _loadCategoryCandidates(String category) async {
    if (_categoryCandidates.containsKey(category)) return;
    if (_loadingCategoryCandidates.contains(category)) return;
    _loadingCategoryCandidates.add(category);
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final candidates = await ref
          .read(placesApiProvider)
          .getCandidates(widget.tripId, category: category);
      if (!mounted) return;
      setState(() {
        _loadingCategoryCandidates.remove(category);
        _categoryCandidates[category] = candidates;
        _loading = _loadingCategoryCandidates.isNotEmpty;
      });
      if (_category == category) {
        _fitCamera();
      }
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(() {
        _loadingCategoryCandidates.remove(category);
        _loading = _loadingCategoryCandidates.isNotEmpty;
        _error = error is ApiException ? error.message : '네트워크 연결을 확인해줘';
      });
    }
  }

  /// 키워드 검색 → 결과를 하단 목록과 지도 마커에 표시한다(선택 상태는 유지).
  Future<void> _search(String rawKeyword) async {
    final keyword = rawKeyword.trim();
    if (keyword.isEmpty) {
      _clearSearch();
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _searchMode = true;
      _searchQuery = keyword;
    });
    try {
      final results = await ref
          .read(placesApiProvider)
          .searchCandidates(widget.tripId, keyword);
      if (!mounted) return;
      setState(() {
        _allCandidates = results;
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

  /// 검색을 끝내고 지역 후보 목록으로 돌아간다.
  void _clearSearch() {
    _searchController.clear();
    setState(() {
      _searchMode = false;
      _searchQuery = '';
    });
    _load();
  }

  void _retry() => _searchMode ? _search(_searchQuery) : _load();

  void _toggleSelected(PlaceCandidate candidate) {
    setState(() {
      if (_selectedCandidates.containsKey(candidate.id)) {
        _selectedCandidates.remove(candidate.id);
        _selectedDayNumbers.remove(candidate.id);
      } else {
        _selectedCandidates[candidate.id] = candidate;
        _selectedDayNumbers[candidate.id] = 1;
      }
    });
  }

  void _setDayNumber(PlaceCandidate candidate, int dayNumber) {
    if (!_selectedCandidates.containsKey(candidate.id)) return;
    setState(() => _selectedDayNumbers[candidate.id] = dayNumber);
  }

  /// 지도를 해당 장소로 확대 이동한다(선택 상태는 건드리지 않음).
  void _focusPlace(PlaceCandidate candidate) {
    if (candidate.lat == null || candidate.lng == null) return;
    _mapController?.animateCamera(
      CameraUpdate.newLatLngZoom(
        LatLng(candidate.lat!, candidate.lng!),
        focusZoom,
      ),
    );
  }

  Future<void> _openScheduleGeneration() async {
    if (_selectedCandidates.isEmpty || _generating) return;
    setState(() => _generating = true);
    final completed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ScheduleGeneratingScreen(
          tripId: widget.tripId,
          selectedPlaces: [
            for (final id in _selectedCandidates.keys)
              SelectedPlace(
                placeId: id,
                dayNumber: _selectedDayNumbers[id] ?? 1,
              ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    setState(() => _generating = false);
    if (completed == true) {
      Navigator.of(context).pop(true);
    }
  }

  /// 로드된 후보 전체가 화면에 들어오도록 카메라를 맞춘다.
  Future<void> _fitCamera() async {
    final controller = _mapController;
    if (controller == null) return;
    final coords = _markerCandidates
        .where((c) => c.lat != null && c.lng != null)
        .toList();
    if (coords.isEmpty) return;

    if (coords.length == 1) {
      await controller.animateCamera(
        CameraUpdate.newLatLngZoom(
          LatLng(coords.first.lat!, coords.first.lng!),
          13,
        ),
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
      for (final c in _markerCandidates)
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
            onTap: () => _toggleSelected(c),
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
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: AppColors.ink900,
          ),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Stack(
          children: [
            GoogleMap(
              initialCameraPosition: koreaCenter,
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
            // 상단 오버레이: 검색창 + (검색 중이 아닐 때만) 카테고리 필터.
            Positioned(
              top: 8,
              left: 0,
              right: 0,
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: PlaceSearchBar(
                      controller: _searchController,
                      searching: _searchMode,
                      onSubmitted: _search,
                      onClear: _clearSearch,
                    ),
                  ),
                  // 검색 결과는 카테고리로 거르지 않으므로 검색 중엔 칩을 숨긴다.
                  if (!_searchMode) ...[
                    const SizedBox(height: 8),
                    CategoryChipRow(
                      selected: _category,
                      onSelect: _selectCategory,
                    ),
                  ],
                ],
              ),
            ),
            if (_loading && _allCandidates.isEmpty)
              const Positioned.fill(
                child: ColoredBox(
                  color: Color(0x66FFFFFF),
                  child: Center(
                    child: CircularProgressIndicator(color: AppColors.ink900),
                  ),
                ),
              ),
            if (_error != null && _allCandidates.isEmpty)
              PlaceErrorOverlay(message: _error!, onRetry: _retry),
            // 하단 드래그 목록 시트.
            Positioned.fill(
              child: PlaceSheet(
                candidates: _visibleCandidates,
                selectedIds: _selectedIds,
                loading: _loading,
                hasCtaPadding: _selectedIds.isNotEmpty,
                listLabel: _searchMode ? '검색 결과' : _categoryLabel(_category),
                emptyText: _searchMode
                    ? '검색 결과가 없어'
                    : (_category != null
                          ? '이 카테고리엔 장소가 없어'
                          : '이 지역에서 찾은 장소가 없어'),
                dayCount: _dayCount,
                selectedDayNumbers: _selectedDayNumbers,
                onRowTap: _focusPlace,
                onToggle: _toggleSelected,
                onDaySelected: _setDayNumber,
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _selectedIds.isEmpty
          ? null
          : PlaceFloatingCta(
              count: _selectedIds.length,
              loading: _generating,
              onTap: _openScheduleGeneration,
            ),
    );
  }
}
