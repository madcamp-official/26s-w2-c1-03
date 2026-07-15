import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../data/places_models.dart';
import 'place_visuals.dart';

/// 목록 행을 탭하면 [PlaceSheet]가 목록 대신 보여주는 상세 탭 — Google 리뷰를 중심으로
/// 이름/주소/전화/평점과 선택 토글을 함께 보여준다. [detail]이 null이면 로딩 중이다.
class PlaceDetailPanel extends StatelessWidget {
  const PlaceDetailPanel({
    super.key,
    required this.place,
    required this.detail,
    required this.loading,
    required this.error,
    required this.selected,
    required this.onToggle,
    required this.onClose,
  });

  /// 목록에서 탭한 원본 후보(로딩 중에도 이름/썸네일을 바로 보여주려고 유지).
  final PlaceCandidate place;
  /// 상세 조회(리뷰 포함) 결과. 로딩 중이거나 실패하면 null.
  final PlaceCandidate? detail;
  final bool loading;
  final String? error;
  final bool selected;
  final VoidCallback onToggle;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final shown = detail ?? place;
    return Column(
      children: [
        _DetailHeader(name: shown.name, onClose: onClose),
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator(color: AppColors.ink900))
              : error != null
                  ? Center(
                      child: Text(
                        error!,
                        style: const TextStyle(
                          color: AppColors.ink400,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    )
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            PlaceThumbnail(candidate: shown, size: 72),
                            const SizedBox(width: 14),
                            Expanded(child: _DetailInfo(place: shown)),
                            GestureDetector(
                              onTap: onToggle,
                              behavior: HitTestBehavior.opaque,
                              child: Padding(
                                padding: const EdgeInsets.all(8),
                                child: SelectionCircleValue(selected: selected),
                              ),
                            ),
                          ],
                        ),
                        if (shown.overview != null && shown.overview!.isNotEmpty) ...[
                          const SizedBox(height: 16),
                          Text(
                            shown.overview!,
                            style: const TextStyle(
                              fontSize: 13.5,
                              height: 1.5,
                              color: AppColors.ink600,
                            ),
                          ),
                        ],
                        const SizedBox(height: 20),
                        _ReviewSection(reviews: shown.reviews),
                      ],
                    ),
        ),
      ],
    );
  }
}

class _DetailHeader extends StatelessWidget {
  const _DetailHeader({required this.name, required this.onClose});

  final String name;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 2, 20, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: AppColors.ink900),
            onPressed: onClose,
          ),
          Expanded(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: AppColors.ink900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailInfo extends StatelessWidget {
  const _DetailInfo({required this.place});

  final PlaceCandidate place;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          place.name,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: AppColors.ink900,
          ),
        ),
        if (place.rating != null) ...[
          const SizedBox(height: 4),
          Row(
            children: [
              const Icon(Icons.star, size: 15, color: AppColors.lime),
              const SizedBox(width: 3),
              Text(
                '${place.rating!.toStringAsFixed(1)} (${place.reviewCount ?? 0})',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink600,
                ),
              ),
            ],
          ),
        ],
        if (place.address != null) ...[
          const SizedBox(height: 4),
          Text(
            place.address!,
            style: const TextStyle(fontSize: 12.5, color: AppColors.ink400),
          ),
        ],
        if (place.tel != null && place.tel!.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            place.tel!,
            style: const TextStyle(fontSize: 12.5, color: AppColors.ink400),
          ),
        ],
      ],
    );
  }
}

class _ReviewSection extends StatelessWidget {
  const _ReviewSection({required this.reviews});

  final List<PlaceReview> reviews;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '구글 리뷰',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w800,
            color: AppColors.ink900,
          ),
        ),
        const SizedBox(height: 10),
        if (reviews.isEmpty)
          const Text(
            '아직 등록된 리뷰가 없어요.',
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: AppColors.ink400,
            ),
          )
        else
          for (final review in reviews) ...[
            _ReviewTile(review: review),
            const SizedBox(height: 14),
          ],
      ],
    );
  }
}

class _ReviewTile extends StatelessWidget {
  const _ReviewTile({required this.review});

  final PlaceReview review;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  review.authorName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink900,
                  ),
                ),
              ),
              if (review.relativeTime != null)
                Text(
                  review.relativeTime!,
                  style: const TextStyle(fontSize: 11.5, color: AppColors.ink400),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: List.generate(
              5,
              (i) => Icon(
                i < review.rating.round() ? Icons.star : Icons.star_border,
                size: 14,
                color: AppColors.lime,
              ),
            ),
          ),
          if (review.text != null && review.text!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              review.text!,
              style: const TextStyle(fontSize: 13, height: 1.4, color: AppColors.ink600),
            ),
          ],
        ],
      ),
    );
  }
}
