import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'trip_detail_screen.dart';
import 'trip_list_controller.dart';
import 'trip_list_state.dart';

/// "홈" 탭 콘텐츠. 여행 생성은 이 화면 안이 아니라 AppShell 중앙 FAB이 담당한다.
class TripListScreen extends ConsumerStatefulWidget {
  const TripListScreen({super.key});

  @override
  ConsumerState<TripListScreen> createState() => _TripListScreenState();
}

class _TripListScreenState extends ConsumerState<TripListScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(tripListControllerProvider.notifier).load());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(tripListControllerProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          '내 여행',
          style: TextStyle(color: Color(0xFF191F28), fontWeight: FontWeight.w700),
        ),
      ),
      body: SafeArea(child: _buildBody(state)),
    );
  }

  Widget _buildBody(TripListState state) {
    return switch (state) {
      TripListLoading() => const Center(child: CircularProgressIndicator()),
      TripListFailed(:final message) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(message, textAlign: TextAlign.center),
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
                '아직 만든 여행이 없어요',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF191F28),
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                '아래 ＋ 버튼으로 첫 여행을 만들어보세요.',
                style: TextStyle(fontSize: 13, color: Color(0xFF8B95A1), fontWeight: FontWeight.w600),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
      TripListLoaded(:final trips) => RefreshIndicator(
        onRefresh: () => ref.read(tripListControllerProvider.notifier).load(),
        child: ListView.separated(
          padding: const EdgeInsets.all(20),
          itemCount: trips.length,
          separatorBuilder: (context, index) => const Divider(height: 1, color: Color(0xFFF2F4F6)),
          itemBuilder: (context, index) {
            final trip = trips[index];
            return ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                trip.title,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF191F28),
                ),
              ),
              subtitle: Text(
                '${trip.cityName} · ${trip.startDate} ~ ${trip.endDate}',
                style: const TextStyle(
                  fontSize: 12.5,
                  color: Color(0xFF8B95A1),
                  fontWeight: FontWeight.w600,
                ),
              ),
              trailing: const Icon(Icons.chevron_right, color: Color(0xFFD1D6DB)),
              onTap: () {
                Navigator.of(
                  context,
                ).push(MaterialPageRoute(builder: (_) => TripDetailScreen(tripId: trip.id)));
              },
            );
          },
        ),
      ),
    };
  }
}
