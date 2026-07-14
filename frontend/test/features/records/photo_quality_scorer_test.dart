import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:tripandend/features/records/data/photo_quality_scorer.dart';

img.Image _sharpCheckerboard() {
  final image = img.Image(width: 64, height: 64);
  for (var y = 0; y < image.height; y++) {
    for (var x = 0; x < image.width; x++) {
      final onLightSquare = ((x ~/ 4) + (y ~/ 4)) % 2 == 0;
      final v = onLightSquare ? 230 : 20;
      image.setPixelRgb(x, y, v, v, v);
    }
  }
  return img.grayscale(image);
}

img.Image _flat(int value) {
  final image = img.Image(width: 64, height: 64);
  for (var y = 0; y < image.height; y++) {
    for (var x = 0; x < image.width; x++) {
      image.setPixelRgb(x, y, value, value, value);
    }
  }
  return img.grayscale(image);
}

void main() {
  group('PhotoQualityScorer', () {
    test('a sharp, evenly-exposed image passes both checks', () {
      final score = PhotoQualityScorer.scoreImage(_sharpCheckerboard());

      expect(score.isBlurry, isFalse);
      expect(score.isBadExposure, isFalse);
    });

    test('a uniformly flat image is flagged as blurry (zero edge response)', () {
      final score = PhotoQualityScorer.scoreImage(_flat(128));

      expect(score.sharpness, 0);
      expect(score.isBlurry, isTrue);
    });

    test('a near-solid white image is flagged as overexposed', () {
      final score = PhotoQualityScorer.scoreImage(_flat(255));

      expect(score.isBadExposure, isTrue);
    });

    test('a near-solid black image is flagged as underexposed', () {
      final score = PhotoQualityScorer.scoreImage(_flat(0));

      expect(score.isBadExposure, isTrue);
    });

    test('sharper images score higher than blurrier ones', () {
      final sharp = PhotoQualityScorer.scoreImage(_sharpCheckerboard());
      final flat = PhotoQualityScorer.scoreImage(_flat(128));

      expect(sharp.sharpness, greaterThan(flat.sharpness));
    });
  });
}
