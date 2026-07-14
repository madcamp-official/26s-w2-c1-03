import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_gradients.dart';
import '../../../core/utils/date_format.dart';
import '../../../core/widgets/app_button.dart';
import '../../trips/data/trip_models.dart';
import '../../trips/presentation/create_trip_screen.dart';
import '../../trips/presentation/trip_detail_screen.dart';
import '../../trips/presentation/trip_list_controller.dart';
import '../../trips/presentation/trip_list_state.dart';

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
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(22, 18, 22, 8),
              child: _ScheduleHeader(),
            ),
            Expanded(child: _buildBody(state)),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(TripListState state) {
    return switch (state) {
      TripListLoading() => const Center(
        child: CircularProgressIndicator(color: AppColors.ink900),
      ),
      TripListFailed(:final message) => _FailedView(
        message: message,
        onRetry: _reload,
      ),
      TripListLoaded(:final trips) => _PlanningTripList(
        trips: _planningTrips(trips),
        onRefresh: _reload,
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
}

class _ScheduleHeader extends StatelessWidget {
  const _ScheduleHeader();

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '스케줄',
          style: TextStyle(
            fontSize: 26,
            fontWeight: FontWeight.w900,
            color: AppColors.ink900,
          ),
        ),
        SizedBox(height: 6),
        Text(
          '계획 중인 여행을 골라 일정을 이어서 만들어봐',
          style: TextStyle(
            fontSize: 14,
            height: 1.4,
            fontWeight: FontWeight.w600,
            color: AppColors.ink600,
          ),
        ),
      ],
    );
  }
}

class _PlanningTripList extends StatelessWidget {
  const _PlanningTripList({required this.trips, required this.onRefresh});

  final List<Trip> trips;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      color: AppColors.ink900,
      child: trips.isEmpty
          ? ListView(
              padding: const EdgeInsets.fromLTRB(22, 80, 22, 120),
              children: const [_EmptyPlanningTrips()],
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(22, 18, 22, 120),
              itemCount: trips.length,
              separatorBuilder: (context, index) => const SizedBox(height: 14),
              itemBuilder: (context, index) =>
                  _PlanningTripCard(trip: trips[index]),
            ),
    );
  }
}

class _PlanningTripCard extends StatelessWidget {
  const _PlanningTripCard({required this.trip});

  final Trip trip;

  @override
  Widget build(BuildContext context) {
    final dday = _ddayLabel(trip);

    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => TripDetailScreen(tripId: trip.id)),
      ),
      child: Container(
        height: 154,
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: AppGradients.forKey(trip.id),
          borderRadius: BorderRadius.circular(24),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _StatusPill(label: dday),
                const Spacer(),
                const Icon(Icons.chevron_right, color: Colors.white, size: 24),
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
