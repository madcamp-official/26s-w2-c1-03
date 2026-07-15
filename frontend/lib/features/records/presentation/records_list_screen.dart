import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_gradients.dart';
import '../../../core/utils/date_format.dart';
import '../../../core/widgets/tab_header.dart';
import '../../places/data/places_api.dart';
import '../data/record_summary_models.dart';
import 'record_detail_screen.dart';
import 'record_trip_picker_screen.dart';
import 'records_list_controller.dart';
import 'records_list_state.dart';

/// TourAPI 관광지(contentTypeId=12) 후보를 카드 대표 사진으로 우선 쓴다
/// (schedule_trip_list_screen.dart의 _PlanningTripCard와 동일한 규칙).
const _touristSpotContentTypeId = '12';

/// "기록" 탭 콘텐츠(API 명세서 §5 GET /records) — 본인이 작성한 여행 기록 전체를
/// 최신순으로 보여준다. AppShell의 IndexedStack 탭이라 화면이 계속 살아있으므로
/// Riverpod StateNotifier로 상태를 들고, 처음 빌드될 때 한 번 로드한다.
class RecordsListScreen extends ConsumerStatefulWidget {
  const RecordsListScreen({super.key});

  @override
  ConsumerState<RecordsListScreen> createState() => _RecordsListScreenState();
}

class _RecordsListScreenState extends ConsumerState<RecordsListScreen> {
  bool _requested = false;

  @override
  Widget build(BuildContext context) {
    if (!_requested) {
      _requested = true;
      Future.microtask(() => ref.read(recordsListControllerProvider.notifier).load());
    }

    final state = ref.watch(recordsListControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.surfaceFaint,
      body: SafeArea(child: _buildBody(state)),
    );
  }

  Widget _buildHeader() {
    return TabHeader(
      title: '기록',
      trailing: IconButton(
        icon: const Icon(Icons.add, color: AppColors.ink900),
        onPressed: _openTripPicker,
      ),
    );
  }

  Future<void> _openTripPicker() async {
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const RecordTripPickerScreen()));
    if (!mounted) return;
    ref.read(recordsListControllerProvider.notifier).load();
  }

  Widget _buildBody(RecordsListState state) {
    return switch (state) {
      RecordsListLoading() => ListView(
        padding: const EdgeInsets.fromLTRB(22, 0, 22, 120),
        children: [
          _buildHeader(),
          const SizedBox(height: 100),
          const Center(child: CircularProgressIndicator(color: AppColors.ink900)),
        ],
      ),
      RecordsListFailed(:final message) => ListView(
        padding: const EdgeInsets.fromLTRB(22, 0, 22, 120),
        children: [
          _buildHeader(),
          Padding(
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
                  onPressed: () => ref.read(recordsListControllerProvider.notifier).load(),
                  child: const Text('다시 시도'),
                ),
              ],
            ),
          ),
        ],
      ),
      RecordsListLoaded(:final records) when records.isEmpty => ListView(
        padding: const EdgeInsets.fromLTRB(22, 0, 22, 120),
        children: [
          _buildHeader(),
          Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 96,
                  height: 96,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(color: AppColors.surfaceSubtle, shape: BoxShape.circle),
                  child: const Icon(Icons.menu_book_outlined, size: 40, color: AppColors.ink300),
                ),
                const SizedBox(height: 16),
                const Text(
                  '아직 작성한 기록이 없어요.',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink900),
                ),
              ],
            ),
          ),
        ],
      ),
      RecordsListLoaded(:final records) => RefreshIndicator(
        onRefresh: () => ref.read(recordsListControllerProvider.notifier).load(),
        color: AppColors.ink900,
        child: ListView.separated(
          padding: const EdgeInsets.fromLTRB(22, 0, 22, 120),
          itemCount: records.length + 1,
          separatorBuilder: (context, index) =>
              SizedBox(height: index == 0 ? 8 : 14),
          itemBuilder: (context, index) {
            if (index == 0) return _buildHeader();
            return _RecordCard(record: records[index - 1]);
          },
        ),
      ),
    };
  }
}

class _RecordCard extends ConsumerStatefulWidget {
  const _RecordCard({required this.record});
  final RecordListItemSummary record;

  @override
  ConsumerState<_RecordCard> createState() => _RecordCardState();
}

class _RecordCardState extends ConsumerState<_RecordCard> {
  String? _fallbackPhotoUrl;

  @override
  void initState() {
    super.initState();
    if (widget.record.coverPhotoUrl == null) _loadFallbackPhoto();
  }

  /// 대표 사진(coverPhotoUrl)을 사용자가 직접 고르지 않은 기록은, 스케줄 탭
  /// 카드와 같은 규칙으로 그 여행 지역의 관광지 후보 사진을 대신 보여준다.
  Future<void> _loadFallbackPhoto() async {
    try {
      final candidates = await ref
          .read(placesApiProvider)
          .getCandidates(widget.record.tripId);
      final withImages = candidates
          .where((c) => c.imageUrl != null && c.imageUrl!.isNotEmpty)
          .toList()
        ..sort((a, b) {
          final aSpot = a.contentTypeId == _touristSpotContentTypeId ? 0 : 1;
          final bSpot = b.contentTypeId == _touristSpotContentTypeId ? 0 : 1;
          return aSpot.compareTo(bSpot);
        });
      if (!mounted || withImages.isEmpty) return;
      setState(() => _fallbackPhotoUrl = withImages.first.imageUrl);
    } catch (_) {
      // 대표 사진은 있으면 좋은 정도라, 후보 조회 실패는 카드 표시를 막지 않는다.
    }
  }

  @override
  Widget build(BuildContext context) {
    final record = widget.record;
    final isDraft = record.status == 'draft';
    final photoUrl = record.coverPhotoUrl ?? _fallbackPhotoUrl;
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () {
        Navigator.of(
          context,
        ).push(MaterialPageRoute(builder: (_) => RecordDetailScreen(recordId: record.id)));
      },
      child: Container(
        height: 110,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: photoUrl == null ? AppGradients.forKey(record.id) : null,
          color: AppColors.surfaceSubtle,
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (photoUrl != null)
              Image.network(
                photoUrl,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Container(
                  decoration: BoxDecoration(gradient: AppGradients.forKey(record.id)),
                ),
              ),
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Color(0x99000000)],
                ),
              ),
            ),
            Positioned(
              left: 16,
              right: 16,
              bottom: 12,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          record.title?.isNotEmpty == true ? record.title! : record.tripCityName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${record.tripCityName} · ${formatTripDateRange(record.tripStartDate, record.tripEndDate)}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: Color(0xE6FFFFFF),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (isDraft)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xE6FFFFFF),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text(
                        '작성중',
                        style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: AppColors.ink600),
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
}
