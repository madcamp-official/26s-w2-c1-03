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
    required this.contentTypeId,
    required this.imageUrl,
    required this.overview,
    required this.tel,
    required this.rating,
    required this.reviewCount,
    this.reviews = const [],
  });

  final String id;
  final String source;
  final String name;
  final String? address;
  final double? lat;
  final double? lng;
  final String? categoryCode;

  /// TourAPI contentTypeId(관광지 12/음식점 39/쇼핑 38). 카테고리 클라이언트 필터에 쓴다.
  final String? contentTypeId;

  final String? imageUrl;
  final String? overview;
  final String? tel;

  /// Google Places 매칭 결과. 매칭 실패 시 둘 다 null(백엔드가 항상 매칭 안 된
  /// 장소를 목록 뒤로 정렬해서 내려준다 — §UNMATCHED_SCORE).
  final double? rating;
  final int? reviewCount;

  /// Google 리뷰(최대 5개). 목록/검색 응답은 항상 빈 배열 — 상세 조회(getDetail)에서만 채워진다.
  final List<PlaceReview> reviews;

  factory PlaceCandidate.fromJson(Map<String, dynamic> json) => PlaceCandidate(
    id: json['id'] as String,
    source: json['source'] as String,
    name: json['name'] as String,
    address: json['address'] as String?,
    lat: (json['lat'] as num?)?.toDouble(),
    lng: (json['lng'] as num?)?.toDouble(),
    categoryCode: json['categoryCode'] as String?,
    contentTypeId: json['contentTypeId'] as String?,
    imageUrl: json['imageUrl'] as String?,
    overview: json['overview'] as String?,
    tel: json['tel'] as String?,
    rating: (json['rating'] as num?)?.toDouble(),
    reviewCount: json['reviewCount'] as int?,
    reviews: (json['reviews'] as List<dynamic>? ?? const [])
        .map((e) => PlaceReview.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

/// Google 리뷰 한 건 — 장소 상세 탭에서 보여준다.
class PlaceReview {
  const PlaceReview({
    required this.authorName,
    required this.rating,
    required this.text,
    required this.relativeTime,
    required this.profilePhotoUrl,
  });

  final String authorName;
  final double rating;
  final String? text;
  final String? relativeTime;
  final String? profilePhotoUrl;

  factory PlaceReview.fromJson(Map<String, dynamic> json) => PlaceReview(
    authorName: json['authorName'] as String,
    rating: (json['rating'] as num).toDouble(),
    text: json['text'] as String?,
    relativeTime: json['relativeTime'] as String?,
    profilePhotoUrl: json['profilePhotoUrl'] as String?,
  );
}
