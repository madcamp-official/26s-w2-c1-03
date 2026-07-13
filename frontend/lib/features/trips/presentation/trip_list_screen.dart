import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_gradients.dart';
import '../../../core/widgets/ai_badge.dart';
import '../../../core/widgets/app_button.dart';
import '../../notifications/notification_inbox_controller.dart';
import '../../notifications/presentation/notifications_screen.dart';
import '../../profile/presentation/profile_controller.dart';
import '../../profile/presentation/profile_state.dart';
import '../data/trip_models.dart';
import 'trip_detail_screen.dart';
import 'trip_list_controller.dart';
import 'trip_list_state.dart';

/// "홈" 탭 콘텐츠(design_example.pdf 시안 `1a` 기준 — 알림 벨 + D-day 히어로 카드 +
/// "다음엔 여기 어때?" AI 추천 캐러셀 + 지난 여행 기록). 여행 생성은 이 화면 안이 아니라
/// AppShell 중앙 FAB이 담당한다.
///
/// "다음엔 여기 어때?"는 아직 백엔드에 추천 여행지 API가 없어(plan.md에 없는 신규
/// 기능) 정적 더미 데이터로만 채운다 — 카드 탭도 "곧 만나요" 안내만 띄운다. Phase 7
/// 결정(국내 여행 전용)에 맞춰 목적지도 국내 도시로만 채운다.
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

class _GreetingHeader extends ConsumerWidget {
  const _GreetingHeader({required this.profileState});
  final ProfileState profileState;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nickname = profileState is ProfileLoaded ? (profileState as ProfileLoaded).user.nickname : null;
    // 이 기기가 받은 알림 중 안 읽은 개수. 알림 확인 창을 열면 markAllRead로 0이 된다.
    final unread = ref.watch(notificationInboxControllerProvider).where((n) => !n.read).length;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: Text(
            nickname != null ? '$nickname님, 안녕! 👋' : '안녕! 👋',
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: AppColors.ink900),
          ),
        ),
        InkWell(
          borderRadius: BorderRadius.circular(19),
          onTap: () => Navigator.of(
            context,
          ).push(MaterialPageRoute(builder: (_) => const NotificationsScreen())),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: const BoxDecoration(
                  color: AppColors.surfaceSubtle,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.notifications_outlined, size: 19, color: AppColors.ink600),
              ),
              // 안 읽은 알림이 실제로 있을 때만 빨간 점을 띄운다.
              if (unread > 0)
                Positioned(
                  right: 0,
                  top: 0,
                  child: Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: AppColors.danger,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 1.5),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

void _showComingSoon(BuildContext context, String label) {
  ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text('$label은(는) 곧 만나요 👋')));
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
          const _RecommendedDestinationsSection(),
          const SizedBox(height: 28),
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
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: '일정 보기',
                  onPressed: () {
                    Navigator.of(
                      context,
                    ).push(MaterialPageRoute(builder: (_) => TripDetailScreen(tripId: trip.id)));
                  },
                ),
              ),
              const SizedBox(width: 8),
              // 공동 여행 계획(초대 링크, Phase 10)이 아직 없어 "곧 만나요"만 띄운다.
              InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: () => _showComingSoon(context, '친구 초대'),
                child: Container(
                  width: 46,
                  height: 52,
                  decoration: BoxDecoration(
                    color: const Color(0x99FFFFFF),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.ios_share, size: 18, color: AppColors.green900),
                ),
              ),
            ],
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

class _RecommendedDestination {
  const _RecommendedDestination({required this.name, required this.subtitle, this.tag});
  final String name;
  final String subtitle;
  final String? tag;
}

/// 정적 더미(위 클래스 상단 주석 참고) — 국내 여행 전용 결정(plan.md §16)에 맞춰
/// 목적지도 국내 도시로만 채운다.
const _recommendedDestinations = [
  _RecommendedDestination(name: '강릉', subtitle: '바다 보러 가기 딱 좋아', tag: 'AI 추천'),
  _RecommendedDestination(name: '여수', subtitle: '밤바다 아직 안 가봤으면', tag: '가성비'),
  _RecommendedDestination(name: '경주', subtitle: '천년 고도 산책하기'),
];

class _RecommendedDestinationsSection extends StatelessWidget {
  const _RecommendedDestinationsSection();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              '다음엔 여기 어때?',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink900),
            ),
            InkWell(
              onTap: () => _showComingSoon(context, '여행지 추천'),
              child: const Text(
                '더보기',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.ink400),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        SizedBox(
          height: 148,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            itemCount: _recommendedDestinations.length,
            separatorBuilder: (context, index) => const SizedBox(width: 14),
            itemBuilder: (context, index) => _DestinationCard(
              destination: _recommendedDestinations[index],
            ),
          ),
        ),
      ],
    );
  }
}

class _DestinationCard extends StatelessWidget {
  const _DestinationCard({required this.destination});
  final _RecommendedDestination destination;

  @override
  Widget build(BuildContext context) {
    final tag = destination.tag;
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () => _showComingSoon(context, '여행지 추천'),
      child: SizedBox(
        width: 130,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 96,
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                gradient: AppGradients.forKey(destination.name),
                borderRadius: BorderRadius.circular(18),
              ),
              alignment: Alignment.topLeft,
              child: tag == null ? null : _DestinationTag(label: tag),
            ),
            const SizedBox(height: 8),
            Text(
              destination.name,
              style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: AppColors.ink900),
            ),
            const SizedBox(height: 2),
            Text(
              destination.subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.ink400),
            ),
          ],
        ),
      ),
    );
  }
}

/// "AI 추천"은 기존 AiBadge(라임)를 그대로 재사용하고, "가성비" 같은 AI와 무관한
/// 태그는 라임을 쓰지 않는다(design.md §8 안티패턴 7번 — AI 신호를 남용하지 않는다).
class _DestinationTag extends StatelessWidget {
  const _DestinationTag({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    if (label == 'AI 추천') {
      return const AiBadge();
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0xE6FFFFFF),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: AppColors.ink600),
      ),
    );
  }
}
