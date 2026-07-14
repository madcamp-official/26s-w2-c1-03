import '../../trips/data/trip_models.dart';
import 'exif_location_service.dart';
import 'photo_candidate.dart';
import 'photo_library_service.dart';

class PhotoFilterResult {
  const PhotoFilterResult({required this.candidates, required this.totalScanned});

  final List<PhotoCandidate> candidates;
  final int totalScanned;
}

/// 온디바이스 1차 필터링 파이프라인 1단계(plan.md Phase 11). 지금은 흔들림/노출/
/// 중복 제거·OCR 문서 감지·얼굴 감지 점수가 아직 없어 촬영일시 최신순만 기준으로
/// 상위 N장을 고른다 — 다음 커밋에서 이 정렬·선별 기준에 각 필터의 감점/제외
/// 로직이 추가된다.
class PhotoFilterPipeline {
  PhotoFilterPipeline({PhotoLibraryService? libraryService, ExifLocationService? exifLocationService})
    : _libraryService = libraryService ?? PhotoLibraryService(),
      _exifLocationService = exifLocationService ?? ExifLocationService();

  final PhotoLibraryService _libraryService;
  final ExifLocationService _exifLocationService;

  Future<PhotoAccessResult> requestAccess() => _libraryService.requestAccess();

  /// [trip]의 startDate~endDate 범위로 사진첩을 조회하고, 여행 규모별 통과율
  /// (§3.2)과 전체 100장 상한을 적용한 뒤 EXIF/지명을 채워 반환한다. photo_manager
  /// 쿼리 자체가 이미 최신순 정렬이라, 통과 상한만큼 앞에서 잘라 쓰면 된다.
  Future<PhotoFilterResult> run(Trip trip) async {
    final assets = await _libraryService.queryByDateRange(
      start: DateTime.parse(trip.startDate),
      end: DateTime.parse(trip.endDate),
    );

    final selected = assets.take(_passCap(assets.length)).toList();
    final candidates = await Future.wait(selected.map(_exifLocationService.buildCandidate));

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
}
