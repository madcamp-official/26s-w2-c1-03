/// API 명세서 §4 GET .../photos/candidates 응답 항목. previewUrl은 백엔드가
/// 내려주는 상대 경로라 실제 로드 시 AppConfig.apiBaseUrl을 붙여야 한다
/// (짧은 TTL 서명이 이미 쿼리스트링에 포함돼 있다).
class PhotoCandidatePreview {
  const PhotoCandidatePreview({
    required this.photoRefId,
    required this.previewUrl,
    required this.takenAt,
    required this.locationName,
  });

  final String photoRefId;
  final String previewUrl;
  final DateTime? takenAt;
  final String? locationName;

  factory PhotoCandidatePreview.fromJson(Map<String, dynamic> json) => PhotoCandidatePreview(
    photoRefId: json['photoRefId'] as String,
    previewUrl: json['previewUrl'] as String,
    takenAt: json['takenAt'] == null ? null : DateTime.parse(json['takenAt'] as String),
    locationName: json['locationName'] as String?,
  );
}

/// API 명세서 §4 POST .../photos/finalize 요청 항목.
class FinalizeSelection {
  const FinalizeSelection({required this.photoRefId, this.caption, this.orderIndex});

  final String photoRefId;
  final String? caption;
  final int? orderIndex;

  Map<String, dynamic> toJson() => {
    'photoRefId': photoRefId,
    if (caption != null) 'caption': caption,
    if (orderIndex != null) 'orderIndex': orderIndex,
  };
}

/// API 명세서 §4 POST .../photos/finalize 응답 항목(record_photos row).
class RecordPhoto {
  const RecordPhoto({
    required this.id,
    required this.recordId,
    required this.storageUrl,
    required this.takenAt,
    required this.locationName,
    required this.caption,
    required this.orderIndex,
    required this.isCover,
  });

  final String id;
  final String recordId;
  final String storageUrl;
  final DateTime? takenAt;
  final String? locationName;
  final String? caption;
  final int orderIndex;
  final bool isCover;

  factory RecordPhoto.fromJson(Map<String, dynamic> json) => RecordPhoto(
    id: json['id'] as String,
    recordId: json['recordId'] as String,
    storageUrl: json['storageUrl'] as String,
    takenAt: json['takenAt'] == null ? null : DateTime.parse(json['takenAt'] as String),
    locationName: json['locationName'] as String?,
    caption: json['caption'] as String?,
    orderIndex: json['orderIndex'] as int,
    isCover: json['isCover'] as bool,
  );
}
