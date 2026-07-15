import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';
import 'record_photo_models.dart';
import 'record_summary_models.dart';

/// API 명세서 §4 사진 파이프라인 전 구간(records 세션 시작 ~ finalize).
class RecordsApi {
  RecordsApi(this._apiClient);

  final ApiClient _apiClient;

  Future<String> startSession(String tripId) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>('/trips/$tripId/records');
    return response.data!['id'] as String;
  }

  /// 텍스트 메타데이터만 배치 등록하고 localId → photoRefId 매핑을 돌려준다.
  Future<Map<String, String>> registerMetadata(
    String tripId,
    String recordId,
    List<({String localId, DateTime takenAt, String? locationName})> photos,
  ) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/trips/$tripId/records/$recordId/photos/metadata',
      data: {
        'photos': [
          for (final p in photos)
            {
              'localId': p.localId,
              'takenAt': p.takenAt.toUtc().toIso8601String(),
              if (p.locationName != null) 'locationName': p.locationName,
            },
        ],
      },
    );
    final items = (response.data!['photos'] as List).cast<Map<String, dynamic>>();
    return {for (final item in items) item['localId'] as String: item['photoRefId'] as String};
  }

  /// [filesByPhotoRefId]의 각 항목을 photoRefId를 필드명으로 하는 multipart 파일로
  /// 보낸다. 업로드는 크기가 크고 느릴 수 있어 기본 타임아웃보다 길게 잡는다.
  Future<List<String>> uploadPhotos(
    String tripId,
    String recordId,
    Map<String, List<int>> filesByPhotoRefId,
  ) async {
    final formData = FormData();
    for (final entry in filesByPhotoRefId.entries) {
      formData.files.add(
        MapEntry(
          entry.key,
          MultipartFile.fromBytes(entry.value, filename: '${entry.key}.jpg'),
        ),
      );
    }

    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/trips/$tripId/records/$recordId/photos/upload',
      data: formData,
      options: Options(
        sendTimeout: const Duration(minutes: 3),
        receiveTimeout: const Duration(minutes: 2),
      ),
    );
    return (response.data!['uploaded'] as List).cast<String>();
  }

  Future<List<String>> curate(String tripId, String recordId) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/trips/$tripId/records/$recordId/photos/curate',
      options: Options(receiveTimeout: const Duration(minutes: 2)),
    );
    return (response.data!['recommended'] as List).cast<String>();
  }

  Future<List<PhotoCandidatePreview>> getCandidates(String tripId, String recordId) async {
    final response = await _apiClient.dio.get<Map<String, dynamic>>(
      '/trips/$tripId/records/$recordId/photos/candidates',
    );
    return (response.data!['items'] as List)
        .map((e) => PhotoCandidatePreview.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<RecordPhoto>> finalizeSelection(
    String tripId,
    String recordId,
    List<FinalizeSelection> selections,
  ) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/trips/$tripId/records/$recordId/photos/finalize',
      data: {'selections': selections.map((s) => s.toJson()).toList()},
    );
    return (response.data!['recordPhotos'] as List)
        .map((e) => RecordPhoto.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// API 명세서 §5 GET /records — 내 모든 기록 목록. 트립 목록(TripsApi.list)과
  /// 같은 이유로 이번 스코프는 첫 페이지만 로드한다(무한 스크롤은 나중 스코프).
  Future<PaginatedRecords> listRecords() async {
    final response = await _apiClient.dio.get<Map<String, dynamic>>('/records');
    return PaginatedRecords.fromJson(response.data!);
  }

  Future<RecordDetail> getRecordDetail(String recordId) async {
    final response = await _apiClient.dio.get<Map<String, dynamic>>('/records/$recordId');
    return RecordDetail.fromJson(response.data!);
  }

  Future<void> deleteRecord(String recordId) {
    return _apiClient.dio.delete<void>('/records/$recordId');
  }

  /// API 명세서 §4 PATCH .../records/{recordId} — 일기 본문 작성/수정,
  /// draft→published 전환.
  Future<void> updateRecordText(
    String tripId,
    String recordId, {
    String? title,
    String? content,
    String? status,
  }) {
    return _apiClient.dio.patch<void>(
      '/trips/$tripId/records/$recordId',
      data: {
        if (title != null) 'title': title,
        if (content != null) 'content': content,
        if (status != null) 'status': status,
      },
    );
  }

  /// API 명세서 §2.6 PUT /trips/{tripId}/cover — recordPhotoId는 요청자 본인이
  /// 작성한 기록의 사진이어야 한다(아니면 403).
  Future<void> setTripCover(String tripId, String recordPhotoId) {
    return _apiClient.dio.put<void>(
      '/trips/$tripId/cover',
      data: {'recordPhotoId': recordPhotoId},
    );
  }

  Future<void> clearTripCover(String tripId) {
    return _apiClient.dio.delete<void>('/trips/$tripId/cover');
  }

  /// API 명세서 §4 PATCH .../photos/{recordPhotoId} — 캡션만 부분 수정.
  Future<void> updatePhotoCaption(
    String tripId,
    String recordId,
    String recordPhotoId,
    String caption,
  ) {
    return _apiClient.dio.patch<void>(
      '/trips/$tripId/records/$recordId/photos/$recordPhotoId',
      data: {'caption': caption},
    );
  }

  /// Day 항목(제목/본문/대표사진) 생성 또는 수정 — PUT이라 안 보낸 필드는 서버가 null로 지운다.
  Future<RecordDayEntry> upsertDayEntry(
    String tripId,
    String recordId,
    String date, {
    String? title,
    String? content,
    String? photoId,
  }) async {
    final response = await _apiClient.dio.put<Map<String, dynamic>>(
      '/trips/$tripId/records/$recordId/days/$date',
      data: {'title': title, 'content': content, 'photoId': photoId},
    );
    return RecordDayEntry.fromJson(response.data!);
  }

  Future<void> deleteDayEntry(String tripId, String recordId, String date) {
    return _apiClient.dio.delete<void>('/trips/$tripId/records/$recordId/days/$date');
  }
}
