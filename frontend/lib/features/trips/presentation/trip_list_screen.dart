import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_gradients.dart';
import '../../../core/utils/date_format.dart';
import '../../../core/widgets/ai_badge.dart';
import '../data/destination_models.dart';
import '../data/trip_models.dart';
import 'destination_detail_screen.dart';
import 'destination_recommendations_controller.dart';
import 'destination_recommendations_state.dart';
import 'trip_detail_screen.dart';
import 'trip_list_controller.dart';
import 'trip_list_state.dart';

/// "홈" 탭 콘텐츠(design_example.pdf 시안 `1a` 기준 — 알림 벨 + D-day 히어로 카드 +
/// "다음엔 여기 어때?" AI 추천 캐러셀 + 지난 여행 기록). 여행 생성은 이 화면 안이 아니라
/// AppShell 중앙 FAB이 담당한다.
///
/// "다음엔 여기 어때?"는 신규 기능(plan.md 원 계획에는 없던 API, 2026-07-15 추가) —
/// `GET /destinations/recommendations`를 실시간으로 불러 렌더링한다. 카드를 탭하면
/// 바로 여행을 만들지 않고 여행지 상세 화면(대표 관광지 + "여행 생성" CTA)으로 이동한다.
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
      ref.read(destinationRecommendationsControllerProvider.notifier).load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(tripListControllerProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(children: [Expanded(child: _buildBody(state))]),
      ),
    );
  }

  Widget _buildBody(TripListState state) {
    return switch (state) {
      TripListLoading() => const Center(
        child: CircularProgressIndicator(color: AppColors.ink900),
      ),
      TripListFailed(:final message) => Center(
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
              TextButton(
                onPressed: () =>
                    ref.read(tripListControllerProvider.notifier).load(),
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
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink900,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                '아래 ＋ 버튼으로 첫 여행을 만들어봐',
                style: TextStyle(
                  fontSize: 13,
                  color: AppColors.ink400,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
      TripListLoaded(:final trips) => _TripListBody(
        trips: trips,
        onRefresh: _reload,
      ),
    };
  }

  Future<void> _reload() =>
      ref.read(tripListControllerProvider.notifier).load();
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
    final completedTrips =
        trips.where((trip) => trip.status == 'completed').toList()
          ..sort((a, b) => b.startDate.compareTo(a.startDate));

    return RefreshIndicator(
      onRefresh: onRefresh,
      color: AppColors.ink900,
      // 상단 히어로는 full-bleed 면으로 쓰고, 아래 콘텐츠는 _HomeSection이
      // 자체 패딩과 배경을 가져 섹션별로 구분되게 한다.
      child: ListView(
        padding: const EdgeInsets.only(bottom: 120),
        children: [
          if (upcoming != null) ...[
            _DdayHeroCard(trip: upcoming),
          ] else ...[
            const SizedBox(height: 18),
          ],
          const _HomeSection(child: _RecommendedDestinationsSection()),
          if (completedTrips.isNotEmpty) ...[
            const SizedBox(height: 12),
            _HomeSection(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '지난 여행 기록',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: AppColors.ink900,
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    height: 148,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      clipBehavior: Clip.hardEdge,
                      itemCount: completedTrips.length,
                      separatorBuilder: (context, index) =>
                          const SizedBox(width: 14),
                      itemBuilder: (context, index) =>
                          _TripCard(trip: completedTrips[index]),
                    ),
                  ),
                ],
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
      final isOngoingNow =
          !todayDate.isBefore(start) && !todayDate.isAfter(end);
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

/// 추천/기록 같은 보조 콘텐츠를 연한 바탕 위 카드로 묶어 상단 히어로와 명확히
/// 구분한다. 상단은 full-bleed 면, 아래는 섹션 카드라는 대비를 만든다.
class _HomeSection extends StatelessWidget {
  const _HomeSection({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: AppColors.surfaceMuted,
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 6),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: AppColors.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.035),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: child,
      ),
    );
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
      padding: const EdgeInsets.fromLTRB(28, 22, 28, 28),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF63D1BD), Color(0xFF45B99F)],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              InkWell(
                borderRadius: BorderRadius.circular(18),
                onTap: () => Navigator.of(context).maybePop(),
                child: const SizedBox(
                  width: 36,
                  height: 36,
                  child: Icon(Icons.close, size: 21, color: Colors.white),
                ),
              ),
              Row(
                children: [
                  _HeroIconButton(
                    icon: Icons.search,
                    onTap: () => _showComingSoon(context, '검색'),
                  ),
                  const SizedBox(width: 8),
                  _HeroIconButton(
                    icon: Icons.map_outlined,
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => TripDetailScreen(tripId: trip.id),
                        ),
                      );
                    },
                  ),
                  const SizedBox(width: 8),
                  _HeroIconButton(
                    icon: Icons.menu,
                    showDot: true,
                    onTap: () => _showComingSoon(context, '메뉴'),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 28),
          Text(
            '${trip.title},',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 25,
              fontWeight: FontWeight.w900,
              color: Colors.white,
              letterSpacing: -0.5,
              height: 1.08,
            ),
          ),
          Text(
            ddayLabel,
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w900,
              color: Colors.white,
              letterSpacing: -0.5,
              height: 1.08,
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  formatTripDateRange(trip.startDate, trip.endDate),
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(width: 6),
                const Icon(
                  Icons.keyboard_arrow_down,
                  size: 16,
                  color: Colors.white,
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          Text(
            message,
            style: TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w700,
              color: Colors.white.withValues(alpha: 0.86),
            ),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              _HeroTextChip(
                label: '가이드',
                selected: true,
                onTap: () => _showComingSoon(context, '가이드'),
              ),
              _HeroTextChip(
                label: '일정',
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => TripDetailScreen(tripId: trip.id),
                    ),
                  );
                },
              ),
              _HeroTextChip(
                label: '관광',
                onTap: () => _showComingSoon(context, '관광'),
              ),
              _HeroTextChip(
                label: '맛집',
                onTap: () => _showComingSoon(context, '맛집'),
              ),
              _HeroTextChip(
                label: '기록',
                onTap: () => _showComingSoon(context, '기록'),
              ),
            ],
          ),
          const SizedBox(height: 24),
          InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => TripDetailScreen(tripId: trip.id),
                ),
              );
            },
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.06),
                    blurRadius: 18,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Row(
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '내 여행 일정 확인하기',
                          style: TextStyle(
                            fontSize: 15.5,
                            fontWeight: FontWeight.w900,
                            color: AppColors.ink900,
                          ),
                        ),
                        SizedBox(height: 5),
                        Text(
                          'AI가 만든 일정과 장소를 다시 볼 수 있어요',
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: AppColors.ink400,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppColors.surfaceSubtle,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(
                      Icons.auto_awesome,
                      size: 21,
                      color: AppColors.lime,
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

class _HeroIconButton extends StatelessWidget {
  const _HeroIconButton({
    required this.icon,
    required this.onTap,
    this.showDot = false,
  });

  final IconData icon;
  final VoidCallback onTap;
  final bool showDot;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          SizedBox(
            width: 34,
            height: 34,
            child: Icon(icon, size: 21, color: Colors.white),
          ),
          if (showDot)
            Positioned(
              right: 3,
              top: 4,
              child: Container(
                width: 6,
                height: 6,
                decoration: const BoxDecoration(
                  color: Color(0xFFFF6B83),
                  shape: BoxShape.circle,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _HeroTextChip extends StatelessWidget {
  const _HeroTextChip({
    required this.label,
    required this.onTap,
    this.selected = false,
  });

  final String label;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 20),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w800,
            color: selected
                ? Colors.white
                : Colors.white.withValues(alpha: 0.78),
          ),
        ),
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
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => TripDetailScreen(tripId: trip.id)),
        );
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

/// `GET /destinations/recommendations`를 불러 렌더링한다(§DestinationsService 알고리즘).
/// 로딩 중엔 스켈레톤, 실패하면(부가 기능이라) 섹션 자체를 조용히 숨긴다.
class _RecommendedDestinationsSection extends ConsumerWidget {
  const _RecommendedDestinationsSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(destinationRecommendationsControllerProvider);
    if (state is DestinationRecommendationsFailed) {
      return const SizedBox.shrink();
    }

    final items = state is DestinationRecommendationsLoaded
        ? state.items
        : null;
    final isLoading = items == null;
    final itemCount = isLoading ? 3 : items.length;
    if (!isLoading && items.isEmpty) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '다음엔 여기 어때?',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w800,
            color: AppColors.ink900,
          ),
        ),
        const SizedBox(height: 14),
        SizedBox(
          height: 148,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.hardEdge,
            itemCount: itemCount,
            separatorBuilder: (context, index) => const SizedBox(width: 14),
            itemBuilder: (context, index) => isLoading
                ? const _DestinationCardSkeleton()
                : _DestinationCard(destination: items[index]),
          ),
        ),
      ],
    );
  }
}

class _DestinationCardSkeleton extends StatelessWidget {
  const _DestinationCardSkeleton();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 130,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 96,
            width: double.infinity,
            decoration: BoxDecoration(
              color: AppColors.surfaceSubtle,
              borderRadius: BorderRadius.circular(18),
            ),
          ),
          const SizedBox(height: 8),
          Container(height: 12, width: 60, color: AppColors.surfaceSubtle),
          const SizedBox(height: 6),
          Container(height: 10, width: 100, color: AppColors.surfaceSubtle),
        ],
      ),
    );
  }
}

class _DestinationCard extends StatelessWidget {
  const _DestinationCard({required this.destination});
  final DestinationRecommendation destination;

  @override
  Widget build(BuildContext context) {
    final tag = destination.tag;
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => DestinationDetailScreen(
            areaCode: destination.areaCode,
            sigunguCode: destination.sigunguCode,
          ),
        ),
      ),
      child: SizedBox(
        width: 130,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _DestinationThumbnail(destination: destination, tag: tag),
            const SizedBox(height: 8),
            Text(
              destination.cityName,
              style: const TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w700,
                color: AppColors.ink900,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              destination.subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.ink400,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 대표 이미지(TourAPI 캐시) — 없으면(또는 로드 실패하면) 기존 그라디언트 플레이스홀더로
/// 자연스럽게 대체한다(design.md §2.5 패턴 그대로 재사용).
class _DestinationThumbnail extends StatelessWidget {
  const _DestinationThumbnail({required this.destination, required this.tag});
  final DestinationRecommendation destination;
  final String? tag;

  @override
  Widget build(BuildContext context) {
    final url = destination.imageUrl;
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: Container(
        height: 96,
        width: double.infinity,
        decoration: url == null
            ? BoxDecoration(gradient: AppGradients.forKey(destination.cityName))
            : null,
        padding: const EdgeInsets.all(8),
        alignment: Alignment.topLeft,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (url != null)
              Positioned.fill(
                child: Image.network(
                  url,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => Container(
                    decoration: BoxDecoration(
                      gradient: AppGradients.forKey(destination.cityName),
                    ),
                  ),
                ),
              ),
            if (tag != null)
              Align(
                alignment: Alignment.topLeft,
                child: _DestinationTag(label: tag!),
              ),
          ],
        ),
      ),
    );
  }
}

/// "AI 추천"은 기존 AiBadge(라임)를 그대로 재사용한다(design.md §8 안티패턴 7번 —
/// AI 신호를 남용하지 않도록 최상위 1건에만 붙는다, DestinationsService 알고리즘 참고).
class _DestinationTag extends StatelessWidget {
  const _DestinationTag({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => const AiBadge();
}
