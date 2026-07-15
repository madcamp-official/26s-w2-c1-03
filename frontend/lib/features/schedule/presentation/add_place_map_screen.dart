import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../places/data/places_api.dart';
import '../../places/data/places_models.dart';
import '../../places/presentation/place_selection_constants.dart';
import '../../places/presentation/widgets/category_chip_row.dart';
import '../../places/presentation/widgets/place_error_overlay.dart';
import '../../places/presentation/widgets/place_floating_cta.dart';
import '../../places/presentation/widgets/place_search_bar.dart';
import '../../places/presentation/widgets/place_sheet.dart';
import '../data/schedule_api.dart';
import '../data/schedule_models.dart';

/// 일정 편집 화면의 "장소 추가" — place_selection_screen.dart와 같은 지도+드래그
/// 시트 레이아웃으로 그 날(dayNumber)에 넣을 장소를 검색/선택한다. 이미 정해진
/// 날짜 하나에만 추가하는 화면이라 일차 탭은 없다. 선택 후 CTA를 누르면 그 자리에서
/// addPlace를 순서대로 호출하고, 실제로 추가된 [ScheduledTripPlace] 목록을 pop으로
/// 돌려준다 — 호출부(ScheduleEditScreen)가 로컬 목록에 그대로 이어붙인다.
class AddPlaceMapScreen extends ConsumerStatefulWidget {
  const AddPlaceMapScreen({
    super.key,
    required this.tripId,
    required this.dayNumber,
  });

  final String tripId;
  final int dayNumber;

  @override
  ConsumerState<AddPlaceMapScreen> createState() => _AddPlaceMapScreenState();
}

class _AddPlaceMapScreenState extends ConsumerState<AddPlaceMapScreen> {
  List<PlaceCandidate> _allCandidates = const [];
  bool _loading = true;
  String? _error;
  String? _category;
  final Map<String, List<PlaceCandidate>> _categoryCandidates = {};
  final Set<String> _loadingCategoryCandidates = {};
  final Map<String, PlaceCandidate> _selectedCandidates = {};
  GoogleMapController? _mapController;
  bool _submitting = false;

  /// 하단 시트 상세 탭 — null이면 목록 모드. place_selection_screen.dart와 동일한 패턴.
  PlaceCandidate? _detailPlace;
  PlaceCandidate? _detailData;
  bool _detailLoading = false;
  String? _detailError;

  /// 직접 입력으로 이미 추가한 장소 — CTA를 누르지 않고 뒤로 가도 함께 반환한다.
  final List<ScheduledTripPlace> _addedCustom = [];

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
      final candidates =
          await ref.read(placesApiProvider).getCandidates(widget.tripId);
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
      if (category != null) _loadCategoryCandidates(category);
      return;
    }
    setState(() => _category = category);
    _fitCamera();
    if (category != null) _loadCategoryCandidates(category);
  }

  String _categoryLabel(String? category) {
    if (category == null) return '장소';
    return categoryFilters.firstWhere((f) => f.$1 == category).$2;
  }

  List<PlaceCandidate> get _visibleCandidates {
    if (_searchMode || _category == null) return _allCandidates;
    final category = _category!;
    return _dedupeCandidates([
      ..._allCandidates.where(
        (c) => placeMatchesCategory(c.contentTypeId, c.categoryCode, category),
      ),
      ...?_categoryCandidates[category],
    ]).take(candidatePageSize).toList();
  }

  Set<String> get _selectedIds => _selectedCandidates.keys.toSet();

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
      if (_category == category) _fitCamera();
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
      final results =
          await ref.read(placesApiProvider).searchCandidates(widget.tripId, keyword);
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
      } else {
        _selectedCandidates[candidate.id] = candidate;
      }
    });
  }

  /// 목록 행 탭 — 지도를 확대 이동하고, 하단 시트를 상세 탭(리뷰 포함)으로 전환한다.
  Future<void> _openDetail(PlaceCandidate candidate) async {
    _focusPlace(candidate);
    setState(() {
      _detailPlace = candidate;
      _detailData = null;
      _detailLoading = true;
      _detailError = null;
    });
    try {
      final detail = await ref.read(placesApiProvider).getDetail(candidate.id);
      if (!mounted || _detailPlace?.id != candidate.id) return;
      setState(() {
        _detailData = detail;
        _detailLoading = false;
      });
    } on DioException catch (e) {
      if (!mounted || _detailPlace?.id != candidate.id) return;
      final error = e.error;
      setState(() {
        _detailLoading = false;
        _detailError = error is ApiException ? error.message : '상세 정보를 불러오지 못했어요.';
      });
    }
  }

  void _closeDetail() => setState(() => _detailPlace = null);

  void _focusPlace(PlaceCandidate candidate) {
    if (candidate.lat == null || candidate.lng == null) return;
    _mapController?.animateCamera(
      CameraUpdate.newLatLngZoom(
        LatLng(candidate.lat!, candidate.lng!),
        focusZoom,
      ),
    );
  }

  Future<void> _fitCamera() async {
    final controller = _mapController;
    if (controller == null) return;
    final coords =
        _markerCandidates.where((c) => c.lat != null && c.lng != null).toList();
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
            onTap: () => _toggleSelected(c),
          ),
    };
  }

  Future<void> _addSelected() async {
    if (_selectedCandidates.isEmpty || _submitting) return;
    setState(() => _submitting = true);
    try {
      final added = <ScheduledTripPlace>[];
      for (final candidate in _selectedCandidates.values) {
        final place = await ref.read(scheduleApiProvider).addPlace(
              tripId: widget.tripId,
              placeId: candidate.id,
              dayNumber: widget.dayNumber,
            );
        added.add(place);
      }
      if (!mounted) return;
      Navigator.of(context).pop([..._addedCustom, ...added]);
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error is ApiException ? error.message : '장소를 추가하지 못했어요.'),
        ),
      );
    }
  }

  Future<void> _openCustomEntry() async {
    final result = await showDialog<(String, String?)>(
      context: context,
      builder: (_) => const _CustomPlaceDialog(),
    );
    if (result == null || !mounted) return;
    final (name, address) = result;
    try {
      final place = await ref.read(scheduleApiProvider).addPlace(
            tripId: widget.tripId,
            customName: name,
            customAddress: address,
            dayNumber: widget.dayNumber,
          );
      if (!mounted) return;
      setState(() => _addedCustom.add(place));
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('"$name" 추가했어요')),
      );
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error is ApiException ? error.message : '장소를 추가하지 못했어요.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_addedCustom);
      },
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          iconTheme: const IconThemeData(color: AppColors.ink900),
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.of(context).pop(_addedCustom),
          ),
          title: Text(
            'Day ${widget.dayNumber}에 장소 추가',
            style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.ink900),
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.edit_note),
              tooltip: '직접 입력',
              onPressed: _openCustomEntry,
            ),
          ],
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
                padding: const EdgeInsets.only(bottom: 90),
                onMapCreated: (controller) {
                  _mapController = controller;
                  _fitCamera();
                },
              ),
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
                    if (!_searchMode) ...[
                      const SizedBox(height: 8),
                      CategoryChipRow(selected: _category, onSelect: _selectCategory),
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
              Positioned.fill(
                child: PlaceSheet(
                  candidates: _visibleCandidates,
                  selectedIds: _selectedIds,
                  loading: _loading,
                  hasCtaPadding: _selectedIds.isNotEmpty,
                  listLabel: _searchMode ? '검색 결과' : _categoryLabel(_category),
                  emptyText: _searchMode
                      ? '검색 결과가 없어'
                      : (_category != null ? '이 카테고리엔 장소가 없어' : '이 지역에서 찾은 장소가 없어'),
                  selectedDayNumbers: {
                    for (final id in _selectedIds) id: widget.dayNumber,
                  },
                  onRowTap: _openDetail,
                  onToggle: _toggleSelected,
                  detailPlace: _detailPlace,
                  detailData: _detailData,
                  detailLoading: _detailLoading,
                  detailError: _detailError,
                  onCloseDetail: _closeDetail,
                ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: _selectedIds.isEmpty
            ? null
            : PlaceFloatingCta(
                count: _selectedIds.length,
                loading: _submitting,
                label: '${_selectedIds.length}곳 Day ${widget.dayNumber}에 추가',
                onTap: _addSelected,
              ),
      ),
    );
  }
}

class _CustomPlaceDialog extends StatefulWidget {
  const _CustomPlaceDialog();

  @override
  State<_CustomPlaceDialog> createState() => _CustomPlaceDialogState();
}

class _CustomPlaceDialogState extends State<_CustomPlaceDialog> {
  final _nameController = TextEditingController();
  final _addressController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;
    final address = _addressController.text.trim();
    Navigator.of(context).pop((name, address.isEmpty ? null : address));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('장소 직접 입력'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _nameController,
            autofocus: true,
            decoration: const InputDecoration(labelText: '장소 이름 *'),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _addressController,
            decoration: const InputDecoration(labelText: '주소 (선택)'),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('취소'),
        ),
        TextButton(onPressed: _submit, child: const Text('추가')),
      ],
    );
  }
}
