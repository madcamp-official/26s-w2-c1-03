import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/data/area_codes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_gradients.dart';
import '../../../core/widgets/app_button.dart';
import '../data/destination_models.dart';
import 'create_trip_screen.dart';
import 'destination_recommendations_controller.dart';

/// 홈 화면 추천 카드를 탭하면 뜨는 여행지 상세 — 대표 이미지/설명 + 대표 관광지 목록,
/// 하단에 "여행 생성" CTA(그 도시를 프리필한 CreateTripScreen으로 이동). BE
/// `GET /destinations/{areaCode}/{sigunguCode}`를 그대로 보여준다.
class DestinationDetailScreen extends ConsumerStatefulWidget {
  const DestinationDetailScreen({super.key, required this.areaCode, required this.sigunguCode});

  final String areaCode;
  final String sigunguCode;

  @override
  ConsumerState<DestinationDetailScreen> createState() => _DestinationDetailScreenState();
}

class _DestinationDetailScreenState extends ConsumerState<DestinationDetailScreen> {
  late Future<DestinationDetail> _future;

  @override
  void initState() {
    super.initState();
    _future = ref
        .read(destinationsApiProvider)
        .getDetail(widget.areaCode, widget.sigunguCode);
  }

  /// area_codes.dart 정적 목록에서 같은 지역 코드를 찾아 CreateTripScreen에 프리필로
  /// 넘긴다 — 못 찾으면(이론상 큐레이션 후보는 항상 있어야 함) 프리필 없이 진행.
  SigunguEntry? _matchSigunguEntry() {
    for (final entry in koreaSigunguList) {
      if (entry.areaCode == widget.areaCode && entry.sigunguCode == widget.sigunguCode) {
        return entry;
      }
    }
    return null;
  }

  void _goCreateTrip() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => CreateTripScreen(initialCity: _matchSigunguEntry())),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: FutureBuilder<DestinationDetail>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator(color: AppColors.ink900));
            }
            if (snapshot.hasError || !snapshot.hasData) {
              return _ErrorBody(onBack: () => Navigator.of(context).pop());
            }
            return _DetailBody(detail: snapshot.data!, onCreateTrip: _goCreateTrip);
          },
        ),
      ),
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.onBack});
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              '여행지 정보를 불러오지 못했어',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink900),
            ),
            const SizedBox(height: 12),
            TextButton(onPressed: onBack, child: const Text('뒤로 가기')),
          ],
        ),
      ),
    );
  }
}

class _DetailBody extends StatelessWidget {
  const _DetailBody({required this.detail, required this.onCreateTrip});

  final DestinationDetail detail;
  final VoidCallback onCreateTrip;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(22, 12, 22, 20),
            children: [
              _BackButton(),
              const SizedBox(height: 16),
              _HeroImage(cityName: detail.cityName, imageUrl: detail.imageUrl),
              const SizedBox(height: 18),
              Text(
                detail.cityName,
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.ink900),
              ),
              const SizedBox(height: 6),
              Text(
                detail.subtitle,
                style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: AppColors.ink400),
              ),
              if (detail.attractions.isNotEmpty) ...[
                const SizedBox(height: 28),
                const Text(
                  '가볼 만한 곳',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink900),
                ),
                const SizedBox(height: 12),
                ...detail.attractions.map((a) => _AttractionTile(attraction: a)),
              ],
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(22, 0, 22, 20),
          child: AppButton(label: '이 여행지로 여행 만들기', onPressed: onCreateTrip),
        ),
      ],
    );
  }
}

class _BackButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => Navigator.of(context).pop(),
      customBorder: const CircleBorder(),
      child: Container(
        width: 36,
        height: 36,
        decoration: const BoxDecoration(color: AppColors.surfaceSubtle, shape: BoxShape.circle),
        child: const Icon(Icons.arrow_back, size: 18, color: AppColors.ink900),
      ),
    );
  }
}

class _HeroImage extends StatelessWidget {
  const _HeroImage({required this.cityName, required this.imageUrl});
  final String cityName;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl;
    return ClipRRect(
      borderRadius: BorderRadius.circular(22),
      child: SizedBox(
        height: 200,
        width: double.infinity,
        child: url == null
            ? Container(decoration: BoxDecoration(gradient: AppGradients.forKey(cityName)))
            : Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) =>
                    Container(decoration: BoxDecoration(gradient: AppGradients.forKey(cityName))),
                loadingBuilder: (context, child, progress) => progress == null
                    ? child
                    : Container(decoration: BoxDecoration(gradient: AppGradients.forKey(cityName))),
              ),
      ),
    );
  }
}

class _AttractionTile extends StatelessWidget {
  const _AttractionTile({required this.attraction});
  final DestinationAttraction attraction;

  @override
  Widget build(BuildContext context) {
    final url = attraction.imageUrl;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: SizedBox(
              width: 64,
              height: 64,
              child: url == null
                  ? Container(decoration: BoxDecoration(gradient: AppGradients.forKey(attraction.name)))
                  : Image.network(
                      url,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => Container(
                        decoration: BoxDecoration(gradient: AppGradients.forKey(attraction.name)),
                      ),
                    ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  attraction.name,
                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: AppColors.ink900),
                ),
                if (attraction.overview != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    attraction.overview!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, color: AppColors.ink400, fontWeight: FontWeight.w600),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
