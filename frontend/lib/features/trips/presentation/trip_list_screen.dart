import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_gradients.dart';
import '../../../core/widgets/app_button.dart';
import '../../profile/presentation/profile_controller.dart';
import '../../profile/presentation/profile_state.dart';
import '../data/trip_models.dart';
import 'trip_detail_screen.dart';
import 'trip_list_controller.dart';
import 'trip_list_state.dart';

/// "홈" 탭 콘텐츠(design.md §5.2, 시안 `2a`). 여행 생성은 이 화면 안이 아니라
/// AppShell 중앙 FAB이 담당한다.
class TripListScreen extends ConsumerStatefulWidget {
  const TripListScreen({super.key});

  @override
  ConsumerState<TripListScreen> createState() => _TripListScreenState();
}

class _TripListScreenState extends ConsumerState<TripListScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(tripListControllerProvider.notifier).load();
      ref.read(profileControllerProvider.notifier).load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(tripListControllerProvider);
    final profileState = ref.watch(profileControllerProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 18, 22, 0),
              child: _GreetingHeader(profileState: profileState),
            ),
            Expanded(child: _buildBody(state)),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(TripListState state) {
    return switch (state) {
      TripListLoading() => const Center(child: CircularProgressIndicator(color: AppColors.ink900)),
      TripListFailed(:final message) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.ink600, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => ref.read(tripListControllerProvider.notifier).load(),
                child: const Text('다시 시도'),
              ),
            ],
          ),
        ),
      ),
      TripListLoaded(:final trips) when trips.isEmpty => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('✈️', style: TextStyle(fontSize: 40)),
              const SizedBox(height: 12),
              const Text(
                '아직 만든 여행이 없어',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink900),
              ),
              const SizedBox(height: 4),
              const Text(
                '아래 ＋ 버튼으로 첫 여행을 만들어봐',
                style: TextStyle(fontSize: 13, color: AppColors.ink400, fontWeight: FontWeight.w600),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
      TripListLoaded(:final trips) => _TripListBody(trips: trips, onRefresh: _reload),
    };
  }

  Future<void> _reload() => ref.read(tripListControllerProvider.notifier).load();
}

class _GreetingHeader extends StatelessWidget {
  const _GreetingHeader({required this.profileState});
  final ProfileState profileState;

  @override
  Widget build(BuildContext context) {
    final nickname = profileState is ProfileLoaded ? (profileState as ProfileLoaded).user.nickname : null;
    final imageUrl = profileState is ProfileLoaded
        ? (profileState as ProfileLoaded).user.profileImageUrl
        : null;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: Text(
            nickname != null ? '$nickname님, 안녕! 👋' : '안녕! 👋',
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: AppColors.ink900),
          ),
        ),
        CircleAvatar(
          radius: 20,
          backgroundColor: AppColors.lime,
          backgroundImage: imageUrl != null ? NetworkImage(imageUrl) : null,
          child: imageUrl == null
              ? Text(
                  nickname != null && nickname.isNotEmpty ? nickname.substring(0, 1) : '',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: AppColors.green800,
                  ),
                )
              : null,
        ),
      ],
    );
  }
}

class _TripListBody extends StatelessWidget {
  const _TripListBody({required this.trips, required this.onRefresh});

  final List<Trip> trips;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final upcoming = _nearestUpcoming(trips);
    final others = trips.where((t) => t.id != upcoming?.id).toList()
      ..sort((a, b) => b.startDate.compareTo(a.startDate));

    return RefreshIndicator(
      onRefresh: onRefresh,
      color: AppColors.ink900,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(22, 20, 22, 120),
        children: [
          if (upcoming != null) ...[
            _DdayHeroCard(trip: upcoming),
            const SizedBox(height: 28),
          ],
          if (others.isNotEmpty) ...[
            const Text(
              '지난 여행 기록',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink900),
            ),
            const SizedBox(height: 14),
            SizedBox(
              height: 148,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                clipBehavior: Clip.none,
                itemCount: others.length,
                separatorBuilder: (context, index) => const SizedBox(width: 14),
                itemBuilder: (context, index) => _TripCard(trip: others[index]),
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// 오늘 이후(또는 진행중)의 여행 중 가장 가까운 하나를 히어로 카드로 고른다.
  Trip? _nearestUpcoming(List<Trip> trips) {
    final today = DateTime.now();
    final todayDate = DateTime(today.year, today.month, today.day);
    Trip? best;
    DateTime? bestStart;
    for (final trip in trips) {
      if (trip.status == 'completed') continue;
      final start = DateTime.tryParse(trip.startDate);
      final end = DateTime.tryParse(trip.endDate);
      if (start == null || end == null) continue;
      final isOngoingNow = !todayDate.isBefore(start) && !todayDate.isAfter(end);
      final isUpcoming = start.isAfter(todayDate) || isOngoingNow;
      if (!isUpcoming) continue;
      if (bestStart == null || start.isBefore(bestStart)) {
        best = trip;
        bestStart = start;
      }
    }
    return best;
  }
}

class _DdayHeroCard extends StatelessWidget {
  const _DdayHeroCard({required this.trip});
  final Trip trip;

  @override
  Widget build(BuildContext context) {
    final today = DateTime.now();
    final todayDate = DateTime(today.year, today.month, today.day);
    final start = DateTime.tryParse(trip.startDate) ?? todayDate;
    final daysUntil = start.difference(todayDate).inDays;

    final String ddayLabel;
    final String message;
    if (daysUntil > 0) {
      ddayLabel = 'D-$daysUntil';
      message = '여행까지 $daysUntil일 남았어, 일정 한 번 볼까?';
    } else if (daysUntil == 0) {
      ddayLabel = 'D-DAY';
      message = '오늘 출발이야! 짐 다 챙겼어?';
    } else {
      ddayLabel = '여행중';
      message = '여행 잘 즐기고 있어? 오늘 일정도 확인해봐';
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(26),
      decoration: BoxDecoration(
        color: AppColors.lime,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  trip.title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.green800,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                '${trip.startDate} – ${trip.endDate}',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.green800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            ddayLabel,
            style: const TextStyle(
              fontSize: 52,
              fontWeight: FontWeight.w800,
              color: AppColors.green900,
              letterSpacing: -1.5,
              height: 1,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            message,
            style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: AppColors.green700),
          ),
          const SizedBox(height: 18),
          AppButton(
            label: '일정 보기',
            onPressed: () {
              Navigator.of(
                context,
              ).push(MaterialPageRoute(builder: (_) => TripDetailScreen(tripId: trip.id)));
            },
          ),
        ],
      ),
    );
  }
}

/// design.md 시안 `1a`의 "지난 여행 기록" 가로 스크롤 그라디언트 카드.
class _TripCard extends StatelessWidget {
  const _TripCard({required this.trip});

  final Trip trip;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () {
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => TripDetailScreen(tripId: trip.id)));
      },
      child: Container(
        width: 130,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: AppGradients.forKey(trip.id),
          borderRadius: BorderRadius.circular(20),
        ),
        alignment: Alignment.bottomLeft,
        child: Text(
          trip.title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
      ),
    );
  }
}
