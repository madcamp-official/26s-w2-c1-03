import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/geo.dart';
import '../../../schedule/data/schedule_models.dart';
import 'schedule_marker_icons.dart';

/// 여행 상세 — 지도 위에 그날 장소를 순번 마커로 찍고, 아래 드래그 시트에 일자 탭 +
/// 장소 목록(카테고리색 배지 + 장소 간 거리)을 띄운다. place_selection_screen.dart의
/// 지도+드래그시트 레이아웃을 재사용한 패턴이다.
class TripScheduleMapView extends StatefulWidget {
  const TripScheduleMapView({
    super.key,
    required this.schedule,
    required this.onEditSchedule,
    required this.onGenerateAi,
  });

  final SchedulePlan schedule;
  final VoidCallback onEditSchedule;
  final VoidCallback onGenerateAi;

  @override
  State<TripScheduleMapView> createState() => _TripScheduleMapViewState();
}

class _TripScheduleMapViewState extends State<TripScheduleMapView> {
  static const double _min = 0.18;
  static const double _mid = 0.48;
  static const double _max = 0.92;
  static const List<double> _snaps = [_min, _mid, _max];

  double _extent = _mid;
  bool _dragging = false;
  final _listController = ScrollController();
  GoogleMapController? _mapController;
  late int _selectedDay;
  Set<Marker> _markers = {};

  List<ScheduleDay> get _sortedDays {
    final days = [...widget.schedule.days]
      ..sort((a, b) => a.dayNumber.compareTo(b.dayNumber));
    return days;
  }

  ScheduleDay? get _currentDay {
    for (final day in _sortedDays) {
      if (day.dayNumber == _selectedDay) return day;
    }
    return _sortedDays.isEmpty ? null : _sortedDays.first;
  }

  List<ScheduledTripPlace> get _currentPlaces {
    final day = _currentDay;
    if (day == null) return const [];
    return [...day.places]..sort((a, b) => a.orderInDay.compareTo(b.orderInDay));
  }

  @override
  void initState() {
    super.initState();
    _selectedDay = _sortedDays.isNotEmpty ? _sortedDays.first.dayNumber : 1;
    _loadMarkers();
  }

  @override
  void didUpdateWidget(covariant TripScheduleMapView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.schedule != widget.schedule) {
      if (_currentDay == null && _sortedDays.isNotEmpty) {
        _selectedDay = _sortedDays.first.dayNumber;
      }
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

  Future<void> _loadMarkers() async {
    final places = _currentPlaces;
    final markers = <Marker>{};
    for (final place in places) {
      if (place.lat == null || place.lng == null) continue;
      final icon = await ScheduleMarkerIcons.numbered(
        number: place.orderInDay,
        color: categoryColor(place.category),
      );
      markers.add(
        Marker(
          markerId: MarkerId(place.id),
          position: LatLng(place.lat!, place.lng!),
          icon: icon,
          anchor: const Offset(0.5, 0.5),
        ),
      );
    }
    if (!mounted) return;
    setState(() => _markers = markers);
    _fitCamera();
  }

  Future<void> _fitCamera() async {
    final controller = _mapController;
    if (controller == null) return;
    final coords = _currentPlaces
        .where((p) => p.lat != null && p.lng != null)
        .toList();
    if (coords.isEmpty) return;

    if (coords.length == 1) {
      await controller.animateCamera(
        CameraUpdate.newLatLngZoom(LatLng(coords.first.lat!, coords.first.lng!), 14),
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
      target = _snaps.firstWhere((s) => s > _extent + 0.001, orElse: () => _max);
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
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onVerticalDragUpdate: (d) => _onDragUpdate(d, maxHeight),
                      onVerticalDragEnd: _onDragEnd,
                      child: Column(
                        children: [
                          Center(
                            child: Container(
                              margin: const EdgeInsets.only(top: 10, bottom: 10),
                              width: 40,
                              height: 4,
                              decoration: BoxDecoration(
                                color: AppColors.border,
                                borderRadius: BorderRadius.circular(999),
                              ),
                            ),
                          ),
                          if (_sortedDays.length > 1) ...[
                            _DayTabs(
                              days: _sortedDays,
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
    if (places.isEmpty) {
      return const Center(
        child: Text(
          '이 날은 아직 장소가 없어',
          style: TextStyle(color: AppColors.ink400, fontWeight: FontWeight.w600),
        ),
      );
    }
    final items = <Widget>[];
    for (var i = 0; i < places.length; i++) {
      items.add(_StopRow(place: places[i], isLast: i == places.length - 1));
      if (i != places.length - 1) {
        final distance = _distanceBetween(places[i], places[i + 1]);
        if (distance != null) {
          items.add(_DistanceChip(label: formatDistance(distance)));
        }
      }
    }
    return ListView(
      controller: _listController,
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
      children: items,
    );
  }

  double? _distanceBetween(ScheduledTripPlace a, ScheduledTripPlace b) {
    if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
    return haversineKm(a.lat!, a.lng!, b.lat!, b.lng!);
  }
}

class _DayTabs extends StatelessWidget {
  const _DayTabs({required this.days, required this.selectedDay, required this.onSelect});

  final List<ScheduleDay> days;
  final int selectedDay;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: days.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final day = days[index];
          final isSelected = day.dayNumber == selectedDay;
          return InkWell(
            onTap: () => onSelect(day.dayNumber),
            borderRadius: BorderRadius.circular(999),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                color: isSelected ? AppColors.ink900 : AppColors.surfaceSubtle,
                borderRadius: BorderRadius.circular(999),
              ),
              alignment: Alignment.center,
              child: Text(
                'DAY ${day.dayNumber}',
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
            icon: const Icon(Icons.auto_awesome, size: 18, color: AppColors.green800),
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
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Column(
            children: [
              Container(
                width: 26,
                height: 26,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                child: Text(
                  '${place.orderInDay}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
              ),
              if (!isLast)
                Expanded(
                  child: Container(width: 2, color: AppColors.border),
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
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
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
                        const SizedBox(height: 4),
                        Text(
                          [
                            _categoryLabels[place.category] ?? '장소',
                            if (place.startTime != null) place.startTime!,
                          ].join(' · '),
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: color,
                          ),
                        ),
                        if (place.address != null && place.address!.isNotEmpty) ...[
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
                  const Icon(Icons.star_border, size: 18, color: AppColors.ink300),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DistanceChip extends StatelessWidget {
  const _DistanceChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 6, bottom: 10),
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
