import 'package:photo_manager/photo_manager.dart';

/// 1차 필터(§3.1) 통과 후보 사진 한 장. `locationName`만 들고 다니고 원본 GPS
/// 좌표는 여기 필드로 존재하지 않는다 — exif_location_service.dart가 파기까지
/// 책임지는 구조(§8.2)라 이 모델 자체가 원본 좌표를 담을 수 없게 설계했다.
class PhotoCandidate {
  const PhotoCandidate({
    required this.asset,
    required this.takenAt,
    required this.locationName,
  });

  /// photo_manager의 사진첩 로컬 식별자(§3.1 "사진 로컬 식별자").
  final AssetEntity asset;
  final DateTime takenAt;
  final String? locationName;

  String get localId => asset.id;
}
