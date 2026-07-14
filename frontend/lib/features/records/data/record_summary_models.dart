import 'record_photo_models.dart';

/// API 명세서 §5 GET /records 목록 항목. coverPhotoUrl은 이 기록 자체의 대표
/// 사진(트립 전체 대표사진과는 다른 개념 — 지정 안 됐으면 orderIndex가 가장
/// 앞선 사진, 사진이 아예 없으면 null)이라 이미 완전한 https URL이다.
class RecordListItemSummary {
  const RecordListItemSummary({
    required this.id,
    required this.tripId,
    required this.title,
    required this.status,
    required this.tripCityName,
    required this.tripStartDate,
    required this.tripEndDate,
    required this.coverPhotoUrl,
    required this.createdAt,
  });

  final String id;
  final String tripId;
  final String? title;

  /// draft | published (travel_record_status, API 명세서 §4).
  final String status;
  final String tripCityName;
  final String tripStartDate;
  final String tripEndDate;
  final String? coverPhotoUrl;
  final DateTime createdAt;

  factory RecordListItemSummary.fromJson(Map<String, dynamic> json) => RecordListItemSummary(
    id: json['id'] as String,
    tripId: json['tripId'] as String,
    title: json['title'] as String?,
    status: json['status'] as String,
    tripCityName: json['tripCityName'] as String,
    tripStartDate: json['tripStartDate'] as String,
    tripEndDate: json['tripEndDate'] as String,
    coverPhotoUrl: json['coverPhotoUrl'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}

class PaginatedRecords {
  const PaginatedRecords({required this.items, required this.nextCursor});

  final List<RecordListItemSummary> items;
  final String? nextCursor;

  factory PaginatedRecords.fromJson(Map<String, dynamic> json) => PaginatedRecords(
    items: (json['items'] as List<dynamic>)
        .map((e) => RecordListItemSummary.fromJson(e as Map<String, dynamic>))
        .toList(),
    nextCursor: json['nextCursor'] as String?,
  );
}

/// API 명세서 §5 GET /records/{recordId} 상세 — 사진 목록 포함.
class RecordDetail {
  const RecordDetail({
    required this.id,
    required this.tripId,
    required this.userId,
    required this.title,
    required this.content,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    required this.photos,
  });

  final String id;
  final String tripId;
  final String userId;
  final String? title;
  final String? content;
  final String status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<RecordPhoto> photos;

  factory RecordDetail.fromJson(Map<String, dynamic> json) => RecordDetail(
    id: json['id'] as String,
    tripId: json['tripId'] as String,
    userId: json['userId'] as String,
    title: json['title'] as String?,
    content: json['content'] as String?,
    status: json['status'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String),
    updatedAt: DateTime.parse(json['updatedAt'] as String),
    photos: (json['photos'] as List<dynamic>)
        .map((e) => RecordPhoto.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}
