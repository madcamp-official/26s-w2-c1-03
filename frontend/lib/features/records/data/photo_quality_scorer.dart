import 'package:image/image.dart' as img;

class PhotoQualityScore {
  const PhotoQualityScore({required this.sharpness, required this.isBlurry, required this.isBadExposure});

  /// 라플라시안 분산 — 값이 낮을수록 흔들림/아웃포커스에 가깝다.
  final double sharpness;
  final bool isBlurry;
  final bool isBadExposure;
}

/// 흔들림/노출 판정(기능명세서 §3.1 1차 필터, 수용기준 4). 원본 대신 썸네일
/// 해상도로도 판별에 충분해 원본 디코드보다 훨씬 가볍다 — 호출부(파이프라인)가
/// 이미 그레이스케일로 변환한 썸네일 [img.Image]를 넘겨준다.
class PhotoQualityScorer {
  // 경험적 임계값. 실제 촬영 데이터로 추후 보정 필요(§16 리스크: "실제 사진
  // 데이터로 프롬프트 실험"과 같은 맥락 — 여기선 필터 임계값 버전).
  static const _blurVarianceThreshold = 50.0;
  static const _darkRatioThreshold = 0.85;
  static const _brightRatioThreshold = 0.85;

  static PhotoQualityScore scoreImage(img.Image gray) {
    final variance = _laplacianVariance(gray);
    final exposure = _exposureRatios(gray);
    return PhotoQualityScore(
      sharpness: variance,
      isBlurry: variance < _blurVarianceThreshold,
      isBadExposure:
          exposure.darkRatio > _darkRatioThreshold || exposure.brightRatio > _brightRatioThreshold,
    );
  }

  /// 3x3 라플라시안 커널 응답의 분산. 가장자리(edge)가 또렷할수록 응답의
  /// 분산이 커지므로 흔들린 사진일수록 이 값이 작다.
  static double _laplacianVariance(img.Image gray) {
    final w = gray.width;
    final h = gray.height;
    if (w < 3 || h < 3) return 0;

    final responses = List<double>.filled((w - 2) * (h - 2), 0);
    var i = 0;
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        final center = gray.getPixel(x, y).luminance;
        final top = gray.getPixel(x, y - 1).luminance;
        final bottom = gray.getPixel(x, y + 1).luminance;
        final left = gray.getPixel(x - 1, y).luminance;
        final right = gray.getPixel(x + 1, y).luminance;
        responses[i++] = (top + bottom + left + right - 4 * center).toDouble();
      }
    }

    final mean = responses.reduce((a, b) => a + b) / responses.length;
    final variance =
        responses.map((v) => (v - mean) * (v - mean)).reduce((a, b) => a + b) / responses.length;
    return variance;
  }

  static ({double darkRatio, double brightRatio}) _exposureRatios(img.Image gray) {
    var dark = 0;
    var bright = 0;
    for (final pixel in gray) {
      final l = pixel.luminance;
      if (l < 15) dark++;
      if (l > 240) bright++;
    }
    final total = gray.width * gray.height;
    return (darkRatio: dark / total, brightRatio: bright / total);
  }
}
