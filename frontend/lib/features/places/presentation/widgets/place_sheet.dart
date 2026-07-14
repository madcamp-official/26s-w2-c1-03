import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../data/places_models.dart';

/// 지도 위에 겹쳐 여닫는 관광지 목록.
///
/// 크기 조절과 목록 스크롤을 분리한다:
///  - 상단(핸들/헤더)을 세로로 드래그 → 시트 높이 변경(3단 스냅).
///  - 목록 영역 스와이프 → 시트 크기는 그대로, 관광지 목록만 자체 스크롤.
class PlaceSheet extends StatefulWidget {
  const PlaceSheet({
    super.key,
    required this.candidates,
    required this.selectedIds,
    required this.loading,
    required this.hasCtaPadding,
    required this.listLabel,
    required this.emptyText,
    required this.selectedDayNumbers,
    required this.onRowTap,
    required this.onToggle,
  });

  final List<PlaceCandidate> candidates;
  final Set<String> selectedIds;
  final bool loading;
  final bool hasCtaPadding;
  final String listLabel;
  final String emptyText;
  /// 선택된 장소의 placeId → 배정된 날짜(1부터). 상단 일차 탭에서 선택 시점에 정해진다.
  final Map<String, int> selectedDayNumbers;
  final ValueChanged<PlaceCandidate> onRowTap;
  final ValueChanged<PlaceCandidate> onToggle;

  @override
  State<PlaceSheet> createState() => _PlaceSheetState();
}

class _PlaceSheetState extends State<PlaceSheet> {
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
      target = _snaps.firstWhere(
        (s) => s > _extent + 0.001,
        orElse: () => _max,
      );
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
                // 상단 핸들/헤더 — 이 영역 드래그만 시트 크기를 바꾼다.
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onVerticalDragUpdate: (d) => _onDragUpdate(d, maxHeight),
                  onVerticalDragEnd: _onDragEnd,
                  child: Column(
                    children: [
                      const _SheetHandle(),
                      _SheetHeader(
                        label: widget.listLabel,
                        total: widget.candidates.length,
                        selectedCount: widget.selectedIds.length,
                      ),
                    ],
                  ),
                ),
                // 목록 — 자체 스크롤 컨트롤러라 시트 크기와 독립적으로 스크롤된다.
                Expanded(child: _buildList()),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildList() {
    if (widget.candidates.isEmpty) {
      final text = widget.loading ? '장소를 불러오는 중…' : widget.emptyText;
      return ListView(
        controller: _listController,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 48),
            child: Center(
              child: Text(
                text,
                style: const TextStyle(
                  color: AppColors.ink400,
                  fontWeight: FontWeight.w600,
                ),
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
          dayNumber: widget.selectedDayNumbers[candidate.id],
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
  const _SheetHeader({
    required this.label,
    required this.total,
    required this.selectedCount,
  });

  final String label;
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
            '$label $total곳',
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: AppColors.ink900,
            ),
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
    required this.dayNumber,
    required this.showDivider,
    required this.onTap,
    required this.onToggle,
  });

  final PlaceCandidate candidate;
  final bool selected;
  /// 선택된 경우에만 값이 있다(선택 안 됐으면 null) — 상단 일차 탭에서 정해진 날짜.
  final int? dayNumber;
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
              ? const Border(
                  bottom: BorderSide(color: AppColors.border, width: 1),
                )
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
                  if (selected) ...[
                    const SizedBox(height: 6),
                    _DayBadge(dayNumber: dayNumber ?? 1),
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
      parts.add(
        '★${candidate.rating!.toStringAsFixed(1)} (${candidate.reviewCount ?? 0})',
      );
    }
    if (candidate.address != null) parts.add(candidate.address!);
    return parts.isEmpty ? null : parts.join(' · ');
  }
}

/// 선택된 장소 행에 붙는 "N일차" 배지 — 선택 당시 상단 일차 탭에서 정해진 날짜를 보여준다.
class _DayBadge extends StatelessWidget {
  const _DayBadge({required this.dayNumber});

  final int dayNumber;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.green800.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        '$dayNumber일차',
        style: const TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w800,
          color: AppColors.green800,
        ),
      ),
    );
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
        border: selected
            ? null
            : Border.all(color: AppColors.ink200, width: 1.8),
      ),
      child: selected
          ? const Icon(Icons.check, size: 16, color: AppColors.lime)
          : null,
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
            ? Icon(
                Icons.place_outlined,
                color: AppColors.ink400,
                size: size * 0.45,
              )
            : Image.network(
                imageUrl,
                fit: BoxFit.cover,
                width: size,
                height: size,
                errorBuilder: (_, _, _) => Icon(
                  Icons.place_outlined,
                  color: AppColors.ink400,
                  size: size * 0.45,
                ),
              ),
      ),
    );
  }
}
