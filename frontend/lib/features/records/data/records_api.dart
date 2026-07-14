import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';
import 'record_photo_models.dart';

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
}
