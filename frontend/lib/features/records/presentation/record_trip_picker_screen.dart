import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_gradients.dart';
import '../../trips/data/trip_models.dart';
import '../../trips/presentation/trip_list_controller.dart' show tripsApiProvider;
import 'record_mode_sheet.dart';

sealed class _PickerState {
  const _PickerState();
}

class _PickerLoading extends _PickerState {
  const _PickerLoading();
}

class _PickerLoaded extends _PickerState {
  const _PickerLoaded(this.trips);
  final List<Trip> trips;
}

class _PickerFailed extends _PickerState {
  const _PickerFailed(this.message);
  final String message;
}

/// "기록" 탭 → "+" → 기록할 여행 고르기. 기록 파이프라인(온디바이스 필터→업로드→
/// curate→선택)은 여행 종료 후(트립 상태 completed)에만 의미가 있어(§8.1) 완료된
/// 여행만 골라 보여준다. 고른 뒤에는 트립 상세의 "기록 시작"과 완전히 같은
/// 바텀시트(showRecordModeSheet)로 들어간다 — 진입 경로만 다르고 그 다음은 동일하다.
class RecordTripPickerScreen extends ConsumerStatefulWidget {
  const RecordTripPickerScreen({super.key});

  @override
  ConsumerState<RecordTripPickerScreen> createState() => _RecordTripPickerScreenState();
}

class _RecordTripPickerScreenState extends ConsumerState<RecordTripPickerScreen> {
  _PickerState _state = const _PickerLoading();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = const _PickerLoading());
    try {
      final result = await ref.read(tripsApiProvider).list();
      final completed = result.items.where((trip) => trip.status == 'completed').toList()
        ..sort((a, b) => b.endDate.compareTo(a.endDate));
      if (!mounted) return;
      setState(() => _state = _PickerLoaded(completed));
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(
        () => _state = _PickerFailed(error is ApiException ? error.message : '네트워크 연결을 확인해주세요.'),
      );
    }
  }

  void _openIntro(Trip trip) {
    showRecordModeSheet(context, trip);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          '기록할 여행 고르기',
          style: TextStyle(color: AppColors.ink900, fontWeight: FontWeight.w800),
        ),
        iconTheme: const IconThemeData(color: AppColors.ink900),
      ),
      body: SafeArea(child: _buildBody(_state)),
    );
  }

  Widget _buildBody(_PickerState state) {
    return switch (state) {
      _PickerLoading() => const Center(child: CircularProgressIndicator(color: AppColors.ink900)),
      _PickerFailed(:final message) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              TextButton(onPressed: _load, child: const Text('다시 시도')),
            ],
          ),
        ),
      ),
      _PickerLoaded(:final trips) when trips.isEmpty => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('🧳', style: TextStyle(fontSize: 40)),
              const SizedBox(height: 12),
              const Text(
                '아직 기록할 수 있는 여행이 없어',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink900),
              ),
              const SizedBox(height: 4),
              const Text(
                '여행이 끝나야(완료 상태) 기록을 시작할 수 있어',
                style: TextStyle(fontSize: 13, color: AppColors.ink400, fontWeight: FontWeight.w600),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
      _PickerLoaded(:final trips) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(22, 12, 22, 40),
        itemCount: trips.length,
        separatorBuilder: (context, index) => const SizedBox(height: 12),
        itemBuilder: (context, index) => _TripPickCard(trip: trips[index], onTap: () => _openIntro(trips[index])),
      ),
    };
  }
}

class _TripPickCard extends StatelessWidget {
  const _TripPickCard({required this.trip, required this.onTap});
  final Trip trip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surfaceSubtle,
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(gradient: AppGradients.forKey(trip.id), shape: BoxShape.circle),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    trip.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink900),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${trip.cityName} · ${trip.startDate} ~ ${trip.endDate}',
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.ink400),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: AppColors.ink300),
          ],
        ),
      ),
    );
  }
}
