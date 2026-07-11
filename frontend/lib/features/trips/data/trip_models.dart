/// API 명세서 §2.1 응답 스키마.
class Trip {
  const Trip({
    required this.id,
    required this.ownerId,
    required this.title,
    required this.cityName,
    required this.areaCode,
    required this.sigunguCode,
    required this.startDate,
    required this.endDate,
    required this.status,
    required this.coverImageUrl,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String ownerId;
  final String title;
  final String cityName;
  final String? areaCode;
  final String? sigunguCode;

  /// 백엔드가 "yyyy-MM-dd" 문자열로 그대로 내려준다(Postgres date 컬럼). 시간대
  /// 계산이 필요 없는 값이라 DateTime으로 파싱하지 않고 문자열 그대로 들고 다닌다.
  final String startDate;
  final String endDate;

  /// planning | ongoing | completed (trip_status enum, API 명세서 §2.1).
  final String status;
  final String? coverImageUrl;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory Trip.fromJson(Map<String, dynamic> json) => Trip(
    id: json['id'] as String,
    ownerId: json['ownerId'] as String,
    title: json['title'] as String,
    cityName: json['cityName'] as String,
    areaCode: json['areaCode'] as String?,
    sigunguCode: json['sigunguCode'] as String?,
    startDate: json['startDate'] as String,
    endDate: json['endDate'] as String,
    status: json['status'] as String,
    coverImageUrl: json['coverImageUrl'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
    updatedAt: DateTime.parse(json['updatedAt'] as String),
  );
}

class PaginatedTrips {
  const PaginatedTrips({required this.items, required this.nextCursor});

  final List<Trip> items;
  final String? nextCursor;

  factory PaginatedTrips.fromJson(Map<String, dynamic> json) => PaginatedTrips(
    items: (json['items'] as List<dynamic>)
        .map((e) => Trip.fromJson(e as Map<String, dynamic>))
        .toList(),
    nextCursor: json['nextCursor'] as String?,
  );
}
