import 'package:flutter_test/flutter_test.dart';
import 'package:tripandend/features/records/data/duplicate_detector.dart';
import 'package:image/image.dart' as img;

img.Image _checkerboard() {
  final image = img.Image(width: 32, height: 32);
  for (var y = 0; y < image.height; y++) {
    for (var x = 0; x < image.width; x++) {
      final onLightSquare = ((x ~/ 4) + (y ~/ 4)) % 2 == 0;
      final v = onLightSquare ? 230 : 20;
      image.setPixelRgb(x, y, v, v, v);
    }
  }
  return image;
}

img.Image _solidGray(int value) {
  final image = img.Image(width: 32, height: 32);
  for (var y = 0; y < image.height; y++) {
    for (var x = 0; x < image.width; x++) {
      image.setPixelRgb(x, y, value, value, value);
    }
  }
  return image;
}

void main() {
  group('DuplicateDetector', () {
    test('identical images hash to the same value and count as duplicates', () {
      final hashA = DuplicateDetector.hashImage(_checkerboard());
      final hashB = DuplicateDetector.hashImage(_checkerboard());

      expect(hashA, hashB);
      expect(DuplicateDetector.isDuplicate(hashA, hashB), isTrue);
    });

    test('very different images are not treated as duplicates', () {
      final checkerHash = DuplicateDetector.hashImage(_checkerboard());
      final solidHash = DuplicateDetector.hashImage(_solidGray(230));

      expect(DuplicateDetector.isDuplicate(checkerHash, solidHash), isFalse);
    });

    test('hammingDistance terminates and is correct even when the sign bit differs', () {
      // 회귀 테스트: 산술 시프트(>>)로 구현했다면 이 케이스에서 count가 -1로
      // 수렴해 종료하지 않는다 — 테스트가 끝난다는 사실 자체가 통과 조건이다.
      expect(DuplicateDetector.hammingDistance(0, -1), 64);
      expect(DuplicateDetector.hammingDistance(-1, -1), 0);
    });
  });
}
