import 'package:image/image.dart' as img;

/// 지각 해시(average hash) 기반 중복 사진 감지(기능명세서 §3.1 1차 필터
/// "중복 제거", 수용기준 4). 완전히 같은 파일이 아니라 연사로 찍은 유사 컷도
/// 잡아내는 게 목적이라, 픽셀 단위 완전일치 대신 8x8 축소 흑백 이미지의 평균
/// 밝기 대비로 64비트 해시를 만들고 해밍 거리로 유사도를 비교한다.
class DuplicateDetector {
  static const hashDimension = 8;

  /// 이 이하 해밍 거리면 "중복"으로 간주. 64비트 중 6비트 이내 차이.
  static const similarityThreshold = 6;

  static int hashImage(img.Image gray) {
    final small = img.copyResize(gray, width: hashDimension, height: hashDimension);

    final values = <int>[];
    for (final pixel in small) {
      values.add(pixel.luminance.toInt());
    }
    final avg = values.reduce((a, b) => a + b) / values.length;

    var hash = 0;
    for (final v in values) {
      hash = (hash << 1) | (v >= avg ? 1 : 0);
    }
    return hash;
  }

  static int hammingDistance(int a, int b) {
    // 해시 최상위 비트가 1이면 산술 시프트(>>)는 부호를 유지한 채 무한히
    // -1로 수렴해 종료하지 않는다 — 부호 없는 시프트(>>>)로 64비트 전체를
    // 소진해야 한다.
    var x = a ^ b;
    var count = 0;
    while (x != 0) {
      count += x & 1;
      x = x >>> 1;
    }
    return count;
  }

  static bool isDuplicate(int hashA, int hashB) => hammingDistance(hashA, hashB) <= similarityThreshold;
}
