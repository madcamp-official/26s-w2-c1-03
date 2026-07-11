import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_list_row.dart';
import '../data/places_api.dart';
import '../data/places_models.dart';

const _categoryFilters = <(String? value, String label)>[
  (null, '전체'),
  ('tourist_spot', '관광지'),
  ('restaurant', '맛집'),
  ('shopping', '쇼핑'),
];

sealed class _CandidatesState {
  const _CandidatesState();
}

class _CandidatesLoading extends _CandidatesState {
  const _CandidatesLoading();
}

class _CandidatesLoaded extends _CandidatesState {
  const _CandidatesLoaded(this.candidates);
  final List<PlaceCandidate> candidates;
}

class _CandidatesFailed extends _CandidatesState {
  const _CandidatesFailed(this.message);
  final String message;
}

/// design.md 시안 `4b` "가고 싶은 곳 골라봐". TourAPI 후보(§places §PlacesService)를
/// 카테고리 필터로 조회하고 체크서클(§5.7)로 다중 선택한다. "N곳으로 최적 동선
/// 짜기" CTA가 실제로 호출할 `POST /trips/{tripId}/schedule/generate`는 아직
/// 백엔드에 없다(plan.md Phase 8, 미구현) — 홈 화면의 AI 추천 캐러셀과 같은 이유로
/// 지금은 선택 상태만 유지하고 CTA는 "곧 만나요" 안내로 대체한다.
class PlaceSelectionScreen extends ConsumerStatefulWidget {
  const PlaceSelectionScreen({super.key, required this.tripId});

  final String tripId;

  @override
  ConsumerState<PlaceSelectionScreen> createState() => _PlaceSelectionScreenState();
}

class _PlaceSelectionScreenState extends ConsumerState<PlaceSelectionScreen> {
  _CandidatesState _state = const _CandidatesLoading();
  String? _category;
  final Set<String> _selectedIds = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = const _CandidatesLoading());
    try {
      final candidates = await ref
          .read(placesApiProvider)
          .getCandidates(widget.tripId, category: _category);
      if (!mounted) return;
      setState(() => _state = _CandidatesLoaded(candidates));
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(
        () => _state = _CandidatesFailed(
          error is ApiException ? error.message : '네트워크 연결을 확인해줘',
        ),
      );
    }
  }

  void _selectCategory(String? category) {
    if (category == _category) return;
    setState(() => _category = category);
    _load();
  }

  void _toggleSelected(String placeId) {
    setState(() {
      if (!_selectedIds.remove(placeId)) {
        _selectedIds.add(placeId);
      }
    });
  }

  void _showComingSoon() {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('AI 동선 짜기는 곧 만나요 👋')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(backgroundColor: Colors.white, elevation: 0),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(22, 0, 22, 16),
              child: Text(
                '가고 싶은 곳 골라봐',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.ink900),
              ),
            ),
            _CategoryChipRow(selected: _category, onSelect: _selectCategory),
            const SizedBox(height: 8),
            Expanded(child: _buildBody(_state)),
          ],
        ),
      ),
      bottomNavigationBar: _selectedIds.isEmpty
          ? null
          : _FloatingCta(count: _selectedIds.length, onTap: _showComingSoon),
    );
  }

  Widget _buildBody(_CandidatesState state) {
    if (state is _CandidatesLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state is _CandidatesFailed) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                state.message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.ink600, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              TextButton(onPressed: _load, child: const Text('다시 시도')),
            ],
          ),
        ),
      );
    }

    final candidates = (state as _CandidatesLoaded).candidates;
    if (candidates.isEmpty) {
      return const Center(
        child: Text(
          '이 지역에서 찾은 장소가 없어',
          style: TextStyle(color: AppColors.ink400, fontWeight: FontWeight.w600),
        ),
      );
    }

    return ListView.builder(
      padding: EdgeInsets.fromLTRB(22, 4, 22, _selectedIds.isEmpty ? 24 : 120),
      itemCount: candidates.length,
      itemBuilder: (context, index) {
        final candidate = candidates[index];
        final isSelected = _selectedIds.contains(candidate.id);
        return AppListRow(
          onTap: () => _toggleSelected(candidate.id),
          showDivider: index != candidates.length - 1,
          leading: _PlaceThumbnail(candidate: candidate),
          title: candidate.name,
          subtitle: _subtitle(candidate),
          trailing: _SelectionCircle(selected: isSelected),
        );
      },
    );
  }

  String? _subtitle(PlaceCandidate candidate) {
    final parts = <String>[];
    if (candidate.address != null) parts.add(candidate.address!);
    if (candidate.rating != null) {
      parts.add('★${candidate.rating!.toStringAsFixed(1)} (${candidate.reviewCount ?? 0})');
    }
    return parts.isEmpty ? null : parts.join(' · ');
  }
}

class _CategoryChipRow extends StatelessWidget {
  const _CategoryChipRow({required this.selected, required this.onSelect});

  final String? selected;
  final ValueChanged<String?> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 22),
        itemCount: _categoryFilters.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final (value, label) = _categoryFilters[index];
          final isSelected = value == selected;
          return InkWell(
            onTap: () => onSelect(value),
            borderRadius: BorderRadius.circular(999),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected ? AppColors.ink900 : AppColors.surfaceSubtle,
                borderRadius: BorderRadius.circular(999),
              ),
              alignment: Alignment.center,
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
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

class _PlaceThumbnail extends StatelessWidget {
  const _PlaceThumbnail({required this.candidate});

  final PlaceCandidate candidate;

  @override
  Widget build(BuildContext context) {
    final imageUrl = candidate.imageUrl;
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: 44,
        height: 44,
        color: AppColors.surfaceSubtle,
        alignment: Alignment.center,
        child: imageUrl == null
            ? const Icon(Icons.place_outlined, color: AppColors.ink400, size: 20)
            : Image.network(
                imageUrl,
                fit: BoxFit.cover,
                width: 44,
                height: 44,
                errorBuilder: (_, _, _) =>
                    const Icon(Icons.place_outlined, color: AppColors.ink400, size: 20),
              ),
      ),
    );
  }
}

/// design.md §5.7 체크서클. 선택됨 = ink900 배경 + 라임 체크, 미선택 = outline만.
class _SelectionCircle extends StatelessWidget {
  const _SelectionCircle({required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 26,
      height: 26,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: selected ? AppColors.ink900 : Colors.transparent,
        border: selected ? null : Border.all(color: AppColors.ink200, width: 1.8),
      ),
      child: selected ? const Icon(Icons.check, size: 15, color: AppColors.lime) : null,
    );
  }
}

class _FloatingCta extends StatelessWidget {
  const _FloatingCta({required this.count, required this.onTap});

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(22, 12, 22, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 28,
            offset: const Offset(0, -8),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: AppButton(
          label: '$count곳으로 최적 동선 짜기',
          variant: AppButtonVariant.lime,
          aiSparkle: true,
          onPressed: onTap,
        ),
      ),
    );
  }
}
