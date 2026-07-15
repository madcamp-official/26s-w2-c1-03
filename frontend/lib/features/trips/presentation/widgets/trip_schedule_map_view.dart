import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/geo.dart';
import '../../../places/data/places_api.dart';
import '../../../schedule/data/schedule_models.dart';
import '../../data/trip_models.dart';
import 'schedule_marker_icons.dart';

/// 여행 상세 — 지도 위에 그날 장소를 순번 마커로 찍고, 아래 드래그 시트에 일자 탭 +
/// 장소 목록(카테고리색 배지 + 장소 간 거리)을 띄운다. place_selection_screen.dart의
/// 지도+드래그시트 레이아웃을 재사용한 패턴이다. 일정이 하나도 없어도(여행을 막
/// 만들었을 때) 이 화면을 그대로 쓴다 — 일차 탭은 trip 기간으로 채우고, 지도는
/// 장소 좌표가 없으니 여행 지역(대략 좌표)으로 줌한다.
class TripScheduleMapView extends ConsumerStatefulWidget {
  const TripScheduleMapView({
    super.key,
    required this.trip,
    required this.schedule,
    required this.onEditSchedule,
    required this.onGenerateAi,
    required this.onAddPlace,
    required this.onStartRecord,
  });

  final Trip trip;
  final SchedulePlan schedule;
  final VoidCallback onEditSchedule;
  final VoidCallback onGenerateAi;

  /// "장소 추가" 버튼 — 현재 보고 있는 일자(dayNumber)를 들고 지도 기반 장소 추가
  /// 화면(AddPlaceMapScreen)으로 이동시킨다.
  final ValueChanged<int> onAddPlace;

  /// 여행이 끝난 뒤(trip.status=='completed') 기록 시작 진입점.
  final VoidCallback onStartRecord;

  @override
  ConsumerState<TripScheduleMapView> createState() =>
      _TripScheduleMapViewState();
}

class _TripScheduleMapViewState extends ConsumerState<TripScheduleMapView> {
  static const double _min = 0.18;
  static const double _mid = 0.48;
  static const double _max = 0.92;
  static const List<double> _snaps = [_min, _mid, _max];

  double _extent = _mid;
  bool _dragging = false;
  final _listController = ScrollController();
  GoogleMapController? _mapController;
  int _selectedDay = 1;
  Set<Marker> _markers = {};
  Set<Polyline> _polylines = {};

  /// 장소가 하나도 없을 때 지도를 맞출 여행 지역 대략 좌표. 후보 조회(§2.2) 결과의
  /// 첫 좌표를 재사용한다 — 지오코딩 API를 새로 붙이지 않고도 정확한 지역 중심을 얻는다.
  LatLng? _regionCenter;

  /// 여행 일수(최소 1일). place_selection_screen.dart의 계산과 동일하다.
  int get _dayCount {
    final start = DateTime.parse(widget.trip.startDate);
    final end = DateTime.parse(widget.trip.endDate);
    final days = end.difference(start).inDays + 1;
    return days < 1 ? 1 : days;
  }

  List<int> get _dayNumbers => List.generate(_dayCount, (i) => i + 1);

  List<ScheduledTripPlace> get _currentPlaces {
    for (final day in widget.schedule.days) {
      if (day.dayNumber == _selectedDay) {
        return [...day.places]
          ..sort((a, b) => a.orderInDay.compareTo(b.orderInDay));
      }
    }
    return const [];
  }

  @override
  void initState() {
    super.initState();
    _loadMarkers();
    if (widget.schedule.days.isEmpty) {
      _loadRegionCenter();
    }
  }

  @override
  void didUpdateWidget(covariant TripScheduleMapView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.schedule != widget.schedule) {
      _loadMarkers();
    }
  }

  @override
  void dispose() {
    _listController.dispose();
    _mapController?.dispose();
    super.dispose();
  }

  void _selectDay(int day) {
    setState(() => _selectedDay = day);
    _loadMarkers();
  }

  /// 일정이 비어 있을 때만 쓰는 폴백 — 후보 목록 첫 좌표를 여행 지역 중심으로 삼는다.
  Future<void> _loadRegionCenter() async {
    try {
      final candidates = await ref
          .read(placesApiProvider)
          .getCandidates(widget.trip.id);
      final withCoords = candidates.firstWhere(
        (c) => c.lat != null && c.lng != null,
        orElse: () => candidates.first,
      );
      if (!mounted || withCoords.lat == null || withCoords.lng == null) return;
      setState(() => _regionCenter = LatLng(withCoords.lat!, withCoords.lng!));
      _fitCamera();
    } catch (_) {
      // 지역 후보 조회 실패는 화면 진입을 막지 않는다 — 지도는 기본 위치를 유지한다.
    }
  }

  Future<void> _loadMarkers() async {
    final places = _currentPlaces;
    final markers = <Marker>{};
    final points = <LatLng>[];
    for (final place in places) {
      if (place.lat == null || place.lng == null) continue;
      final icon = await ScheduleMarkerIcons.numbered(
        number: place.orderInDay,
        color: categoryColor(place.category),
      );
      final position = LatLng(place.lat!, place.lng!);
      points.add(position);
      markers.add(
        Marker(
          markerId: MarkerId(place.id),
          position: position,
          icon: icon,
          anchor: const Offset(0.5, 0.5),
        ),
      );
    }
    final polylines = <Polyline>{};
    if (points.length > 1) {
      polylines.add(
        Polyline(
          polylineId: PolylineId('day-$_selectedDay-route'),
          points: points,
          color: AppColors.lime,
          width: 2,
          patterns: [PatternItem.dash(12), PatternItem.gap(8)],
          startCap: Cap.roundCap,
          endCap: Cap.roundCap,
          jointType: JointType.round,
        ),
      );
    }
    if (!mounted) return;
    setState(() {
      _markers = markers;
      _polylines = polylines;
    });
    _fitCamera();
  }

  Future<void> _fitCamera() async {
    final controller = _mapController;
    if (controller == null) return;
    final coords = _currentPlaces
        .where((p) => p.lat != null && p.lng != null)
        .toList();

    if (coords.isEmpty) {
      final region = _regionCenter;
      if (region == null) return;
      await controller.animateCamera(CameraUpdate.newLatLngZoom(region, 12));
      return;
    }

    if (coords.length == 1) {
      await controller.animateCamera(
        CameraUpdate.newLatLngZoom(
          LatLng(coords.first.lat!, coords.first.lng!),
          14,
        ),
      );
      return;
    }

    var minLat = coords.first.lat!, maxLat = coords.first.lat!;
    var minLng = coords.first.lng!, maxLng = coords.first.lng!;
    for (final c in coords) {
      minLat = minLat < c.lat! ? minLat : c.lat!;
      maxLat = maxLat > c.lat! ? maxLat : c.lat!;
      minLng = minLng < c.lng! ? minLng : c.lng!;
      maxLng = maxLng > c.lng! ? maxLng : c.lng!;
    }
    final bounds = LatLngBounds(
      southwest: LatLng(minLat, minLng),
      northeast: LatLng(maxLat, maxLng),
    );
    await Future.delayed(const Duration(milliseconds: 250));
    if (!mounted) return;
    await controller.animateCamera(CameraUpdate.newLatLngBounds(bounds, 80));
  }

  void _onDragUpdate(DragUpdateDetails details, double maxHeight) {
    setState(() {
      _dragging = true;
      _extent = (_extent - details.primaryDelta! / maxHeight).clamp(_min, _max);
    });
  }

  void _onDragEnd(DragEndDetails details) {
    final velocity = details.primaryVelocity ?? 0;
    double target;
    if (velocity < -300) {
      target = _snaps.firstWhere(
        (s) => s > _extent + 0.001,
        orElse: () => _max,
      );
    } else if (velocity > 300) {
      target = _snaps.lastWhere((s) => s < _extent - 0.001, orElse: () => _min);
    } else {
      target = _snaps.reduce(
        (a, b) => (_extent - a).abs() < (_extent - b).abs() ? a : b,
      );
    }
    setState(() {
      _dragging = false;
      _extent = target;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        GoogleMap(
          initialCameraPosition: const CameraPosition(
            target: LatLng(36.5, 127.8),
            zoom: 6.5,
          ),
          markers: _markers,
          polylines: _polylines,
          myLocationButtonEnabled: false,
          zoomControlsEnabled: false,
          padding: const EdgeInsets.only(bottom: 90),
          onMapCreated: (controller) {
            _mapController = controller;
            _fitCamera();
          },
        ),
        LayoutBuilder(
          builder: (context, constraints) {
            final maxHeight = constraints.maxHeight;
            return Align(
              alignment: Alignment.bottomCenter,
              child: AnimatedContainer(
                duration: _dragging
                    ? Duration.zero
                    : const Duration(milliseconds: 220),
                curve: Curves.easeOut,
                height: _extent * maxHeight,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(24),
                  ),
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
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onVerticalDragUpdate: (d) => _onDragUpdate(d, maxHeight),
                      onVerticalDragEnd: _onDragEnd,
                      child: Column(
                        children: [
                          Center(
                            child: Container(
                              margin: const EdgeInsets.only(
                                top: 10,
                                bottom: 10,
                              ),
                              width: 40,
                              height: 4,
                              decoration: BoxDecoration(
                                color: AppColors.border,
                                borderRadius: BorderRadius.circular(999),
                              ),
                            ),
                          ),
                          if (widget.trip.status == 'completed') ...[
                            _RecordBanner(onTap: widget.onStartRecord),
                            const SizedBox(height: 8),
                          ],
                          if (_dayCount > 1) ...[
                            _DayTabs(
                              dayNumbers: _dayNumbers,
                              selectedDay: _selectedDay,
                              onSelect: _selectDay,
                            ),
                            const SizedBox(height: 8),
                          ],
                          _SheetHeader(
                            dayNumber: _selectedDay,
                            stopCount: _currentPlaces.length,
                            onEditSchedule: widget.onEditSchedule,
                            onGenerateAi: widget.onGenerateAi,
                          ),
                        ],
                      ),
                    ),
                    Expanded(child: _buildStopList()),
                  ],
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildStopList() {
    final places = _currentPlaces;
    final items = <Widget>[];
    if (places.isEmpty) {
      items.add(
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: Center(
            child: Text(
              '이 날은 아직 장소가 없어',
              style: TextStyle(
                color: AppColors.ink400,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      );
    } else {
      for (var i = 0; i < places.length; i++) {
        items.add(_StopRow(place: places[i], isLast: i == places.length - 1));
        if (i != places.length - 1) {
          final distance = _distanceBetween(places[i], places[i + 1]);
          if (distance != null) {
            items.add(_DistanceChip(label: formatDistance(distance)));
          }
        }
      }
    }
    items.add(
      Padding(
        padding: const EdgeInsets.only(top: 4),
        child: TextButton.icon(
          onPressed: () => widget.onAddPlace(_selectedDay),
          style: TextButton.styleFrom(
            foregroundColor: AppColors.lime,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          ),
          icon: const Icon(Icons.add, size: 18),
          label: const Text(
            '장소 추가',
            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800),
          ),
        ),
      ),
    );
    return ListView(
      controller: _listController,
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
      children: items,
    );
  }

  double? _distanceBetween(ScheduledTripPlace a, ScheduledTripPlace b) {
    if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
      return null;
    }
    return haversineKm(a.lat!, a.lng!, b.lat!, b.lng!);
  }
}

class _DayTabs extends StatelessWidget {
  const _DayTabs({
    required this.dayNumbers,
    required this.selectedDay,
    required this.onSelect,
  });

  final List<int> dayNumbers;
  final int selectedDay;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: dayNumbers.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final dayNumber = dayNumbers[index];
          final isSelected = dayNumber == selectedDay;
          return InkWell(
            onTap: () => onSelect(dayNumber),
            borderRadius: BorderRadius.circular(999),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                color: isSelected ? AppColors.ink900 : AppColors.surfaceSubtle,
                borderRadius: BorderRadius.circular(999),
              ),
              alignment: Alignment.center,
              child: Text(
                'DAY $dayNumber',
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
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

/// 여행 종료(trip.status=='completed') 후 지도 화면에서도 기록을 시작할 수 있게
/// 하는 배너 — 예전엔 TripDetailReadOnlyView의 _RecordEntryCard가 이 역할이었다.
class _RecordBanner extends StatelessWidget {
  const _RecordBanner({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.lime,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            children: [
              const Icon(
                Icons.auto_stories_outlined,
                size: 18,
                color: AppColors.onLime,
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  '여행이 끝났어요 · 기록을 시작해볼까?',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: AppColors.onLime,
                  ),
                ),
              ),
              const Icon(
                Icons.chevron_right,
                size: 18,
                color: AppColors.onLime,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SheetHeader extends StatelessWidget {
  const _SheetHeader({
    required this.dayNumber,
    required this.stopCount,
    required this.onEditSchedule,
    required this.onGenerateAi,
  });

  final int dayNumber;
  final int stopCount;
  final VoidCallback onEditSchedule;
  final VoidCallback onGenerateAi;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 2, 12, 8),
      child: Row(
        children: [
          Text(
            'day $dayNumber',
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w900,
              color: AppColors.ink900,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '$stopCount곳',
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.ink400,
            ),
          ),
          const Spacer(),
          IconButton(
            onPressed: onGenerateAi,
            tooltip: 'AI로 스케줄 짜기',
            icon: const Icon(
              Icons.auto_awesome,
              size: 18,
              color: AppColors.lime,
            ),
          ),
          TextButton(
            onPressed: onEditSchedule,
            style: TextButton.styleFrom(foregroundColor: AppColors.ink900),
            child: const Text(
              '편집',
              style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }
}

class _StopRow extends StatelessWidget {
  const _StopRow({required this.place, required this.isLast});

  final ScheduledTripPlace place;
  final bool isLast;

  static const _categoryLabels = {
    'attraction': '관광명소',
    'restaurant': '음식점',
    'cafe': '카페',
  };

  @override
  Widget build(BuildContext context) {
    final color = categoryColor(place.category);
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 52,
            child: Padding(
              padding: const EdgeInsets.only(top: 2, right: 8),
              child: Text(
                place.startTime ?? '',
                textAlign: TextAlign.right,
                style: const TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink600,
                ),
              ),
            ),
          ),
          Column(
            children: [
              Container(
                width: 10,
                height: 10,
                margin: const EdgeInsets.only(top: 3),
                decoration: const BoxDecoration(
                  color: AppColors.lime,
                  shape: BoxShape.circle,
                ),
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    margin: const EdgeInsets.only(top: 4),
                    color: AppColors.border,
                  ),
                ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.surfaceMuted,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.borderStrong),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _CategoryThumbnail(
                    imageUrl: place.imageUrl,
                    category: place.category,
                    color: color,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _categoryLabels[place.category] ?? '장소',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppColors.ink400,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          place.name.isEmpty ? '이름 없는 장소' : place.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: AppColors.ink900,
                          ),
                        ),
                        if (place.address != null &&
                            place.address!.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            place.address!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppColors.ink600,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 장소 카드 왼쪽 썸네일 — 사진(imageUrl)이 있으면 사진을, 없으면 카테고리 아이콘을
/// 원형 배지 위에 보여준다. 색은 categoryColor와 동일해 장소 리스트 색과 통일된다.
class _CategoryThumbnail extends StatelessWidget {
  const _CategoryThumbnail({
    required this.imageUrl,
    required this.category,
    required this.color,
  });

  final String? imageUrl;
  final String? category;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 44,
      height: 44,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
      ),
      child: imageUrl != null && imageUrl!.isNotEmpty
          ? Image.network(
              imageUrl!,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) =>
                  Icon(categoryIcon(category), size: 20, color: color),
            )
          : Icon(categoryIcon(category), size: 20, color: color),
    );
  }
}

class _DistanceChip extends StatelessWidget {
  const _DistanceChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 54, bottom: 10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: AppColors.borderStrong),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            color: AppColors.ink400,
          ),
        ),
      ),
    );
  }
}
