import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

/// 얼굴 감지 기반 제3자 비중 감점(기능명세서 §8.4 — 단순 개수·위치 파악, 신원
/// 식별 아님). 문서 필터처럼 제외하지 않고 점수만 깎는다 — 동행인과 함께 찍힌
/// 사진도 여행 기록엔 자연스러운 컷이라 얼굴이 있다는 이유만으로 빼면 안
/// 된다(수용기준 6: "추천 우선순위가 낮아져야 한다"이지 "제외"가 아니다).
class FacePrivacyScorer {
  FacePrivacyScorer()
    : _detector = FaceDetector(options: FaceDetectorOptions(performanceMode: FaceDetectorMode.fast));

  final FaceDetector _detector;

  /// 0.0(감점 없음) ~ 1.0(최대 감점). 얼굴이 프레임에서 차지하는 면적 비중과
  /// 얼굴 수 둘 다 감점에 반영한다 — 클로즈업 인물샷일수록, 여러 명이 나올수록
  /// 감점이 커진다.
  Future<double> penaltyFor(String filePath, {required int imageWidth, required int imageHeight}) async {
    if (imageWidth <= 0 || imageHeight <= 0) return 0.0;

    final faces = await _detector.processImage(InputImage.fromFilePath(filePath));
    if (faces.isEmpty) return 0.0;

    final imageArea = imageWidth * imageHeight;
    final faceAreaRatio = faces
        .map((f) => (f.boundingBox.width * f.boundingBox.height) / imageArea)
        .reduce((a, b) => a + b)
        .clamp(0.0, 1.0);
    final countPenalty = ((faces.length - 1) * 0.15).clamp(0.0, 0.5);

    return (faceAreaRatio * 0.7 + countPenalty).clamp(0.0, 1.0);
  }

  Future<void> dispose() => _detector.close();
}
