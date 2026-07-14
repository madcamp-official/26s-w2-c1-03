import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;
import 'package:photo_manager/photo_manager.dart';

import '../../trips/data/trip_models.dart';
import 'duplicate_detector.dart';
import 'exif_location_service.dart';
import 'face_privacy_scorer.dart';
import 'photo_candidate.dart';
import 'photo_library_service.dart';
import 'photo_quality_scorer.dart';
import 'sensitive_content_detector.dart';

class PhotoFilterResult {
  const PhotoFilterResult({required this.candidates, required this.totalScanned});

  final List<PhotoCandidate> candidates;
  final int totalScanned;
}

typedef _Analyzed = ({AssetEntity asset, double sharpness, int phash});
typedef _Ranked = ({AssetEntity asset, double score});

const _thumbnailSize = ThumbnailSize.square(256);

/// compute()로 별도 isolate에서 돌리는 순수 함수. 썸네일 1장을 한 번만
/// 디코드해 흔들림/노출 판정과 중복 감지용 해시를 함께 만든다(디코드 재사용).
({double sharpness, bool isBlurry, bool isBadExposure, int phash}) _analyzeThumbnail(Uint8List bytes) {
  final decoded = img.decodeImage(bytes);
  if (decoded == null) {
    return (sharpness: 0, isBlurry: true, isBadExposure: false, phash: 0);
  }
  final gray = img.grayscale(decoded);
  final quality = PhotoQualityScorer.scoreImage(gray);
  final phash = DuplicateDetector.hashImage(gray);
  return (
    sharpness: quality.sharpness,
    isBlurry: quality.isBlurry,
    isBadExposure: quality.isBadExposure,
    phash: phash,
  );
}

/// 온디바이스 1차 필터링 파이프라인(plan.md Phase 11, 기능명세서 §3.1/§8.4).
/// 순서: (1) 썸네일 기반 흔들림/노출 제외 + 지각 해시로 중복 제거 → (2) 생존분에
/// 한해서만 OCR 문서 감지(제외)와 얼굴 감지 감점(비용이 큰 ML 추론이라 1차로
/// 걸러진 사진에만 돌린다) → (3) 여행 규모별 통과율(§3.2)로 최종 상한 적용 →
/// (4) EXIF/지명 채우기.
class PhotoFilterPipeline {
  PhotoFilterPipeline({
    PhotoLibraryService? libraryService,
    ExifLocationService? exifLocationService,
    SensitiveContentDetector? sensitiveContentDetector,
    FacePrivacyScorer? facePrivacyScorer,
  }) : _libraryService = libraryService ?? PhotoLibraryService(),
       _exifLocationService = exifLocationService ?? ExifLocationService(),
       _sensitiveContentDetector = sensitiveContentDetector ?? SensitiveContentDetector(),
       _facePrivacyScorer = facePrivacyScorer ?? FacePrivacyScorer();

  final PhotoLibraryService _libraryService;
  final ExifLocationService _exifLocationService;
  final SensitiveContentDetector _sensitiveContentDetector;
  final FacePrivacyScorer _facePrivacyScorer;

  static const _thumbnailBatchSize = 20;

  Future<PhotoAccessResult> requestAccess() => _libraryService.requestAccess();

  /// [trip]의 startDate~endDate 범위로 사진첩을 조회하고, 온디바이스 필터
  /// 전 구간(흔들림/노출/중복/문서/얼굴)을 통과한 사진 중 여행 규모별 통과율
  /// (§3.2)과 전체 100장 상한을 적용해 EXIF/지명을 채워 반환한다.
  Future<PhotoFilterResult> run(Trip trip) async {
    final assets = await _libraryService.queryByDateRange(
      start: DateTime.parse(trip.startDate),
      end: DateTime.parse(trip.endDate),
    );
    if (assets.isEmpty) {
      return const PhotoFilterResult(candidates: [], totalScanned: 0);
    }

    final qualityPassed = await _filterByQualityAndDuplicates(assets);
    final ranked = await _excludeSensitiveAndScoreFaces(qualityPassed);

    ranked.sort((a, b) => b.score.compareTo(a.score));
    final cap = _passCap(assets.length);
    final finalists = ranked.take(cap).map((r) => r.asset).toList()
      ..sort((a, b) => a.createDateTime.compareTo(b.createDateTime));

    final candidates = await Future.wait(finalists.map(_exifLocationService.buildCandidate));
    return PhotoFilterResult(candidates: candidates, totalScanned: assets.length);
  }

  /// "필터 없이 최근 N장" 폴백(§16 리스크 대응). run()이 오래 걸리거나 실패할 때
  /// 나머지 파이프라인(추천/선택/업로드)을 먼저 검증할 수 있게 하는 단순 경로 —
  /// EXIF 역지오코딩도 건너뛰어 즉시 결과를 낸다.
  Future<PhotoFilterResult> fallbackRecent(Trip trip, {int limit = 30}) async {
    final assets = await _libraryService.queryByDateRange(
      start: DateTime.parse(trip.startDate),
      end: DateTime.parse(trip.endDate),
    );
    final selected = assets.take(limit);

    final candidates = [
      for (final asset in selected)
        PhotoCandidate(asset: asset, takenAt: asset.createDateTime, locationName: null),
    ];

    return PhotoFilterResult(candidates: candidates, totalScanned: assets.length);
  }

  /// 썸네일 기준 흔들림/노출 판정으로 우선 제외하고, 남은 것들을 지각 해시
  /// 기준으로 중복 그룹핑해 그룹당 가장 선명한 한 장만 남긴다. 무거운 ML
  /// 추론(OCR/얼굴 감지) 전에 값싼 필터로 후보를 먼저 좁히기 위함이다.
  Future<List<_Analyzed>> _filterByQualityAndDuplicates(List<AssetEntity> assets) async {
    final analyzed = <_Analyzed>[];
    for (var i = 0; i < assets.length; i += _thumbnailBatchSize) {
      final batch = assets.sublist(i, (i + _thumbnailBatchSize).clamp(0, assets.length));
      final results = await Future.wait(batch.map(_analyzeAsset));
      for (final result in results) {
        if (result != null) analyzed.add(result);
      }
    }
    return _dropDuplicates(analyzed);
  }

  Future<_Analyzed?> _analyzeAsset(AssetEntity asset) async {
    final bytes = await asset.thumbnailDataWithSize(_thumbnailSize);
    if (bytes == null) return null;

    final analysis = await compute(_analyzeThumbnail, bytes);
    if (analysis.isBlurry || analysis.isBadExposure) return null;

    return (asset: asset, sharpness: analysis.sharpness, phash: analysis.phash);
  }

  /// 지각 해시 해밍 거리가 임계값 이내인 것들을 같은 그룹으로 묶고, 그룹당
  /// 가장 선명한(sharpness 최대) 한 장만 남긴다. O(n^2) 비교이지만 비트 연산
  /// 수준이라 여행 기간 내 사진 수 규모에서는 충분히 빠르다.
  List<_Analyzed> _dropDuplicates(List<_Analyzed> analyzed) {
    final kept = <_Analyzed>[];
    for (final candidate in analyzed) {
      final duplicateIndex = kept.indexWhere(
        (k) => DuplicateDetector.isDuplicate(k.phash, candidate.phash),
      );
      if (duplicateIndex == -1) {
        kept.add(candidate);
      } else if (candidate.sharpness > kept[duplicateIndex].sharpness) {
        kept[duplicateIndex] = candidate;
      }
    }
    return kept;
  }

  /// 생존분에 한해 OCR/바코드 기반 문서 감지(제외, §8.4)와 얼굴 감지 기반
  /// 제3자 비중 감점(순위 하락만, 제외 아님)을 적용한다.
  Future<List<_Ranked>> _excludeSensitiveAndScoreFaces(List<_Analyzed> analyzed) async {
    if (analyzed.isEmpty) return const [];
    final maxSharpness = analyzed.map((a) => a.sharpness).reduce((a, b) => a > b ? a : b);
    final normalizer = maxSharpness <= 0 ? 1.0 : maxSharpness;

    final ranked = <_Ranked>[];
    for (final item in analyzed) {
      final file = await item.asset.file;
      if (file == null) continue;

      final isDocument = await _sensitiveContentDetector.isDocument(file.path);
      if (isDocument) continue;

      final facePenalty = await _facePrivacyScorer.penaltyFor(
        file.path,
        imageWidth: item.asset.width,
        imageHeight: item.asset.height,
      );

      final score = (item.sharpness / normalizer) * (1 - facePenalty * 0.5);
      ranked.add((asset: item.asset, score: score));
    }
    return ranked;
  }

  /// 여행 규모별 1차 필터 통과율(기능명세서 §3.2), 전체 상한 100장(수용기준 §3.1-7).
  static int _passCap(int total) {
    if (total == 0) return 0;
    final rate = switch (total) {
      <= 100 => 0.40,
      <= 300 => 0.25,
      <= 600 => 0.15,
      _ => 0.08,
    };
    return (total * rate).round().clamp(0, 100).toInt();
  }

  Future<void> dispose() async {
    await _sensitiveContentDetector.dispose();
    await _facePrivacyScorer.dispose();
  }
}
