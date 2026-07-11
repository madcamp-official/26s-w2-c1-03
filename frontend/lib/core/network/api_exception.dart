/// 백엔드 API 명세서 §0 에러 포맷( { error: { code, message } } )을 파싱한 예외.
/// code는 USER_CANCELLED / NETWORK_ERROR / TOKEN_INVALID / PROVIDER_ERROR /
/// VALIDATION_ERROR 등 (API 명세서 §1, common/exceptions/error-code.ts).
class ApiException implements Exception {
  const ApiException({required this.code, required this.message, this.statusCode});

  final String code;
  final String message;
  final int? statusCode;

  @override
  String toString() => 'ApiException($code): $message';
}
