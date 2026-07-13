/// API 명세서 §2.2 응답 스키마(`PlaceCandidateDto`, src/places/places.service.ts).
class PlaceCandidate {
  const PlaceCandidate({
    required this.id,
    required this.source,
    required this.name,
    required this.address,
    required this.lat,
    required this.lng,
    required this.categoryCode,
    required this.imageUrl,
    required this.overview,
    required this.tel,
    required this.rating,
    required this.reviewCount,
  });

  final String id;
  final String source;
  final String name;
  final String? address;
  final double? lat;
  final double? lng;
  final String? categoryCode;
  final String? imageUrl;
  final String? overview;
  final String? tel;

  /// Google Places 매칭 결과. 매칭 실패 시 둘 다 null(백엔드가 항상 매칭 안 된
  /// 장소를 목록 뒤로 정렬해서 내려준다 — §UNMATCHED_SCORE).
  final double? rating;
  final int? reviewCount;

  factory PlaceCandidate.fromJson(Map<String, dynamic> json) => PlaceCandidate(
    id: json['id'] as String,
    source: json['source'] as String,
    name: json['name'] as String,
    address: json['address'] as String?,
    lat: (json['lat'] as num?)?.toDouble(),
    lng: (json['lng'] as num?)?.toDouble(),
    categoryCode: json['categoryCode'] as String?,
    imageUrl: json['imageUrl'] as String?,
    overview: json['overview'] as String?,
    tel: json['tel'] as String?,
    rating: (json['rating'] as num?)?.toDouble(),
    reviewCount: json['reviewCount'] as int?,
  );
}
