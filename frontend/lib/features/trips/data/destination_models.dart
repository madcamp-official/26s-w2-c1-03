/// 홈 화면 "다음엔 여기 어때?" 추천 카드 하나(BE `GET /destinations/recommendations`
/// 응답 항목). tag는 "AI 추천" 또는 null — 최상위 1건에만 붙는다(BE 알고리즘 참고).
class DestinationRecommendation {
  const DestinationRecommendation({
    required this.areaCode,
    required this.sigunguCode,
    required this.cityName,
    required this.subtitle,
    required this.tag,
    required this.imageUrl,
  });

  final String areaCode;
  final String sigunguCode;
  final String cityName;
  final String subtitle;
  final String? tag;
  final String? imageUrl;

  factory DestinationRecommendation.fromJson(Map<String, dynamic> json) =>
      DestinationRecommendation(
        areaCode: json['areaCode'] as String,
        sigunguCode: json['sigunguCode'] as String,
        cityName: json['cityName'] as String,
        subtitle: json['subtitle'] as String,
        tag: json['tag'] as String?,
        imageUrl: json['imageUrl'] as String?,
      );
}

/// 추천 카드 탭 시 상세 화면(BE `GET /destinations/{areaCode}/{sigunguCode}` 응답)에
/// 쓰이는 대표 관광지 한 곳.
class DestinationAttraction {
  const DestinationAttraction({required this.name, required this.imageUrl, required this.overview});

  final String name;
  final String? imageUrl;
  final String? overview;

  factory DestinationAttraction.fromJson(Map<String, dynamic> json) => DestinationAttraction(
    name: json['name'] as String,
    imageUrl: json['imageUrl'] as String?,
    overview: json['overview'] as String?,
  );
}

class DestinationDetail {
  const DestinationDetail({
    required this.areaCode,
    required this.sigunguCode,
    required this.cityName,
    required this.subtitle,
    required this.imageUrl,
    required this.attractions,
  });

  final String areaCode;
  final String sigunguCode;
  final String cityName;
  final String subtitle;
  final String? imageUrl;
  final List<DestinationAttraction> attractions;

  factory DestinationDetail.fromJson(Map<String, dynamic> json) => DestinationDetail(
    areaCode: json['areaCode'] as String,
    sigunguCode: json['sigunguCode'] as String,
    cityName: json['cityName'] as String,
    subtitle: json['subtitle'] as String,
    imageUrl: json['imageUrl'] as String?,
    attractions: (json['attractions'] as List<dynamic>)
        .map((e) => DestinationAttraction.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}
