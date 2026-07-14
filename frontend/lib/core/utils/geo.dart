import 'dart:math';

/// 두 좌표 사이 직선거리(km). 백엔드 src/common/utils/geo.util.ts와 동일한 공식이다.
double haversineKm(double lat1, double lng1, double lat2, double lng2) {
  const earthRadiusKm = 6371.0;
  final dLat = _toRadians(lat2 - lat1);
  final dLng = _toRadians(lng2 - lng1);
  final a =
      sin(dLat / 2) * sin(dLat / 2) +
      cos(_toRadians(lat1)) * cos(_toRadians(lat2)) * sin(dLng / 2) * sin(dLng / 2);
  final c = 2 * atan2(sqrt(a), sqrt(1 - a));
  return earthRadiusKm * c;
}

double _toRadians(double degrees) => degrees * pi / 180;

/// 사람이 읽기 좋은 거리 표시 — 1km 미만은 "180m", 이상은 "35.8km".
String formatDistance(double km) {
  if (km < 1) {
    return '${(km * 1000).round()}m';
  }
  return '${km.toStringAsFixed(1)}km';
}
