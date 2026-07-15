import 'dart:ui';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_gradients.dart';
import '../../../core/utils/date_format.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/tab_header.dart';
import '../../places/data/places_api.dart';
import '../../trips/data/trip_models.dart';
import '../../trips/presentation/create_trip_screen.dart';
import '../../trips/presentation/trip_detail_screen.dart';
import '../../trips/presentation/trip_list_controller.dart';
import '../../trips/presentation/trip_list_state.dart';

/// TourAPI 관광지(contentTypeId=12) 후보를 카드 대표 사진으로 우선 쓴다.
const _touristSpotContentTypeId = '12';

/// 스케줄 탭: 현재 계획 중(planning)인 여행을 모아 보여준다.
/// 실제 일자별 스케줄 조회/편집은 Phase 9에서 이어 붙이고, 지금은 여행 단위 진입점 역할을 한다.
class ScheduleTripListScreen extends ConsumerStatefulWidget {
  const ScheduleTripListScreen({super.key});

  @override
  ConsumerState<ScheduleTripListScreen> createState() =>
      _ScheduleTripListScreenState();
}

class _ScheduleTripListScreenState
    extends ConsumerState<ScheduleTripListScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(
      () => ref.read(tripListControllerProvider.notifier).load(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(tripListControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.surfaceFaint,
      body: SafeArea(child: _buildBody(state)),
    );
  }

  Widget _buildBody(TripListState state) {
    return switch (state) {
      TripListLoading() => ListView(
        padding: const EdgeInsets.fromLTRB(22, 0, 22, 120),
        children: const [
          TabHeader(title: '스케줄'),
          SizedBox(height: 4),
          _ScheduleHeader(),
          SizedBox(height: 80),
          Center(child: CircularProgressIndicator(color: AppColors.ink900)),
        ],
      ),
      TripListFailed(:final message) => ListView(
        padding: const EdgeInsets.fromLTRB(22, 0, 22, 120),
        children: [
          const TabHeader(title: '스케줄'),
          const SizedBox(height: 4),
          const _ScheduleHeader(),
          _FailedView(message: message, onRetry: _reload),
        ],
      ),
      TripListLoaded(:final trips) => _PlanningTripList(
        trips: _planningTrips(trips),
        onRefresh: _reload,
        onDelete: _deleteTrip,
      ),
    };
  }

  List<Trip> _planningTrips(List<Trip> trips) {
    final planning = trips.where((trip) => trip.status == 'planning').toList()
      ..sort((a, b) => a.startDate.compareTo(b.startDate));
    return planning;
  }

  Future<void> _reload() =>
      ref.read(tripListControllerProvider.notifier).load();

  Future<void> _deleteTrip(Trip trip) async {
    try {
      await ref.read(tripsApiProvider).delete(trip.id);
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error is ApiException ? error.message : '삭제하지 못했어요.'),
        ),
      );
    } finally {
      if (mounted) {
        await ref.read(tripListControllerProvider.notifier).load();
      }
    }
  }
}

Future<bool> _confirmDeleteTrip(BuildContext context, Trip trip) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('여행을 삭제할까요?'),
      content: Text('\'${trip.title}\'을(를) 삭제하면 되돌릴 수 없어요.'),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(false),
          child: const Text('취소'),
        ),
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(true),
          child: const Text('삭제', style: TextStyle(color: AppColors.danger)),
        ),
      ],
    ),
  );
  return confirmed ?? false;
}

class _ScheduleHeader extends StatelessWidget {
  const _ScheduleHeader();

  @override
  Widget build(BuildContext context) {
    return const Text(
      '계획 중인 여행을 골라 일정을 이어서 만들어봐',
      style: TextStyle(
        fontSize: 14,
        height: 1.4,
        fontWeight: FontWeight.w600,
        color: AppColors.ink600,
      ),
    );
  }
}

class _PlanningTripList extends StatelessWidget {
  const _PlanningTripList({
    required this.trips,
    required this.onRefresh,
    required this.onDelete,
  });

  final List<Trip> trips;
  final Future<void> Function() onRefresh;
  final Future<void> Function(Trip trip) onDelete;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      color: AppColors.ink900,
      child: trips.isEmpty
          ? ListView(
              padding: const EdgeInsets.fromLTRB(22, 0, 22, 120),
              children: const [
                TabHeader(title: '스케줄'),
                SizedBox(height: 4),
                _ScheduleHeader(),
                SizedBox(height: 72),
                _EmptyPlanningTrips(),
              ],
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(22, 0, 22, 120),
              itemCount: trips.length + 2,
              separatorBuilder: (context, index) =>
                  SizedBox(height: index == 0 ? 4 : 14),
              itemBuilder: (context, index) {
                if (index == 0) return const TabHeader(title: '스케줄');
                if (index == 1) return const _ScheduleHeader();
                final trip = trips[index - 2];
                return Dismissible(
                  key: ValueKey(trip.id),
                  direction: DismissDirection.endToStart,
                  dismissThresholds: const {DismissDirection.endToStart: 0.2},
                  confirmDismiss: (_) => _confirmDeleteTrip(context, trip),
                  onDismissed: (_) => onDelete(trip),
                  background: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    alignment: Alignment.centerRight,
                    decoration: BoxDecoration(
                      color: AppColors.danger,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: const Icon(
                      Icons.delete_outline,
                      color: Colors.white,
                    ),
                  ),
                  child: _PlanningTripCard(trip: trip),
                );
              },
            ),
    );
  }
}

class _PlanningTripCard extends ConsumerStatefulWidget {
  const _PlanningTripCard({required this.trip});

  final Trip trip;

  @override
  ConsumerState<_PlanningTripCard> createState() => _PlanningTripCardState();
}

class _PlanningTripCardState extends ConsumerState<_PlanningTripCard> {
  String? _photoUrl;

  @override
  void initState() {
    super.initState();
    _loadPhoto();
  }

  /// 여행 지역(areaCode/sigunguCode)의 관광지 후보 중 사진이 있는 걸 대표 이미지로
  /// 쓴다. 못 찾으면 null로 남겨서 기존 그라디언트 플레이스홀더를 그대로 쓴다.
  Future<void> _loadPhoto() async {
    try {
      final candidates = await ref
          .read(placesApiProvider)
          .getCandidates(widget.trip.id);
      final withImages = candidates
          .where((c) => c.imageUrl != null && c.imageUrl!.isNotEmpty)
          .toList()
        ..sort((a, b) {
          final aSpot = a.contentTypeId == _touristSpotContentTypeId ? 0 : 1;
          final bSpot = b.contentTypeId == _touristSpotContentTypeId ? 0 : 1;
          return aSpot.compareTo(bSpot);
        });
      if (!mounted || withImages.isEmpty) return;
      setState(() => _photoUrl = withImages.first.imageUrl);
    } catch (_) {
      // 대표 사진은 있으면 좋은 정도라, 후보 조회 실패는 카드 표시를 막지 않는다.
    }
  }

  @override
  Widget build(BuildContext context) {
    final trip = widget.trip;
    final dday = _ddayLabel(trip);
    final photoUrl = _photoUrl;

    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => TripDetailScreen(tripId: trip.id)),
      ),
      child: Container(
        height: 154,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          gradient: photoUrl == null ? AppGradients.forKey(trip.id) : null,
          borderRadius: BorderRadius.circular(24),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (photoUrl != null)
              ImageFiltered(
                imageFilter: ImageFilter.blur(sigmaX: 2.5, sigmaY: 2.5),
                child: Image.network(
                  photoUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) => DecoratedBox(
                    decoration: BoxDecoration(gradient: AppGradients.forKey(trip.id)),
                  ),
                ),
              ),
            if (photoUrl != null)
              // 사진이 너무 또렷해 보이지 않도록 전체에 흰 스크림을 얹어 은은하게 만들고,
              // 하단은 텍스트 가독성을 위해 추가로 어둡게 한다.
              DecoratedBox(
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.3)),
              ),
            if (photoUrl != null)
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.02),
                      Colors.black.withValues(alpha: 0.5),
                    ],
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _StatusPill(label: dday),
                      const Spacer(),
                      const Icon(
                        Icons.chevron_right,
                        color: Colors.white,
                        size: 24,
                      ),
                    ],
                  ),
                  const Spacer(),
                  Text(
                    trip.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '${trip.cityName} · ${formatTripDateRange(trip.startDate, trip.endDate)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: Color(0xF2FFFFFF),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _ddayLabel(Trip trip) {
    final today = DateTime.now();
    final todayDate = DateTime(today.year, today.month, today.day);
    final start = DateTime.tryParse(trip.startDate);
    if (start == null) return '계획 중';
    final diff = start.difference(todayDate).inDays;
    if (diff > 0) return 'D-$diff';
    if (diff == 0) return 'D-DAY';
    return '계획 중';
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: const Color(0xE6FFFFFF),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w900,
          color: AppColors.ink900,
        ),
      ),
    );
  }
}

class _EmptyPlanningTrips extends StatelessWidget {
  const _EmptyPlanningTrips();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text('🗺️', style: TextStyle(fontSize: 44)),
        const SizedBox(height: 14),
        const Text(
          '계획 중인 여행이 없어',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w800,
            color: AppColors.ink900,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          '새 여행을 만들면 여기에서 스케줄을 이어서 볼 수 있어',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 13.5,
            height: 1.45,
            fontWeight: FontWeight.w600,
            color: AppColors.ink400,
          ),
        ),
        const SizedBox(height: 18),
        AppButton(
          label: '여행 만들기',
          onPressed: () => Navigator.of(
            context,
          ).push(MaterialPageRoute(builder: (_) => const CreateTripScreen())),
        ),
      ],
    );
  }
}

class _FailedView extends StatelessWidget {
  const _FailedView({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.ink600,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 12),
            TextButton(onPressed: onRetry, child: const Text('다시 시도')),
          ],
        ),
      ),
    );
  }
}
