import 'package:geocoding/geocoding.dart';
import 'package:photo_manager/photo_manager.dart';
import 'photo_candidate.dart';

/// EXIF(촬영일시/GPS) 추출 → 지명 역변환 → 원본 좌표 파기(§8.2). 이 서비스의
/// 공개 API는 [PhotoCandidate]만 반환한다 — 그 타입 자체에 위경도 필드가 없으므로
/// 원본 좌표가 이 함수 스코프 밖으로 나갈 방법이 구조적으로 없다.
class ExifLocationService {
  /// [asset] 하나의 촬영일시/지명을 읽어 [PhotoCandidate]를 만든다. GPS가 없거나
  /// 역지오코딩이 실패하면(오프라인 등) locationName은 null로 둔다 — 위치 정보는
  /// 필수가 아니라 있으면 좋은 부가 정보다.
  Future<PhotoCandidate> buildCandidate(AssetEntity asset) async {
    final takenAt = asset.createDateTime;
    final locationName = await _resolveLocationName(asset);
    return PhotoCandidate(asset: asset, takenAt: takenAt, locationName: locationName);
  }

  Future<String?> _resolveLocationName(AssetEntity asset) async {
    try {
      final latlng = await asset.latlngAsync();
      if (latlng == null) return null;
      final lat = latlng.latitude;
      final lng = latlng.longitude;
      if (lat == 0 && lng == 0) return null;

      final placemarks = await Geocoding().placemarkFromCoordinates(lat, lng);
      if (placemarks.isEmpty) return null;

      final place = placemarks.first;
      final parts = [
        place.locality,
        place.subAdministrativeArea,
        place.administrativeArea,
        place.country,
      ].where((part) => part != null && part.isNotEmpty).toList();
      return parts.isEmpty ? null : parts.first;
      // lat/lng은 여기 지역 변수로만 존재하고 이 함수를 벗어나지 않는다 — 반환값은
      // 지명 문자열뿐이라 원본 좌표는 자연히 파기된다(§8.2).
    } catch (_) {
      return null;
    }
  }
}
