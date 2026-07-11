import 'package:dio/dio.dart';
import '../config/app_config.dart';
import '../storage/token_storage.dart';
import 'api_exception.dart';

/// 액세스 토큰 자동 첨부 + 401 시 리프레시 1회 재시도까지 처리하는 공용 Dio 인스턴스.
/// plan.md §8.1 "JWT 자동 첨부/재발급".
class ApiClient {
  ApiClient({required TokenStorage tokenStorage, Dio? dio})
    : _tokenStorage = tokenStorage,
      _dio = dio ?? Dio(BaseOptions(baseUrl: AppConfig.apiBaseUrl)) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // /auth/*는 로그인 전이거나 토큰 자체를 다루는 호출이라 액세스 토큰을 첨부하지 않는다.
          if (!options.path.startsWith('/auth/')) {
            final accessToken = await _tokenStorage.readAccessToken();
            if (accessToken != null) {
              options.headers['Authorization'] = 'Bearer $accessToken';
            }
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final isUnauthorized = error.response?.statusCode == 401;
          final isAuthEndpoint = error.requestOptions.path.startsWith('/auth/');
          if (!isUnauthorized || isAuthEndpoint || _isRetry(error.requestOptions)) {
            handler.next(_normalize(error));
            return;
          }

          try {
            final refreshed = await _refresh();
            if (!refreshed) {
              await _tokenStorage.clear();
              handler.next(_normalize(error));
              return;
            }
            handler.resolve(await _retry(error.requestOptions));
          } catch (_) {
            await _tokenStorage.clear();
            handler.next(_normalize(error));
          }
        },
      ),
    );
  }

  final Dio _dio;
  final TokenStorage _tokenStorage;
  Future<bool>? _refreshing;

  Dio get dio => _dio;

  bool _isRetry(RequestOptions options) => options.extra['retried'] == true;

  /// 동시에 여러 요청이 401을 맞아도 refresh 호출은 한 번만 나가도록 Future를 공유한다.
  Future<bool> _refresh() {
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<bool> _doRefresh() async {
    final refreshToken = await _tokenStorage.readRefreshToken();
    if (refreshToken == null) return false;

    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/token/refresh',
        data: {'refreshToken': refreshToken},
      );
      final data = response.data!;
      await _tokenStorage.saveTokens(
        accessToken: data['accessToken'] as String,
        refreshToken: data['refreshToken'] as String,
      );
      return true;
    } on DioException {
      return false;
    }
  }

  Future<Response<dynamic>> _retry(RequestOptions options) async {
    final accessToken = await _tokenStorage.readAccessToken();
    final newOptions = options.copyWith(
      extra: {...options.extra, 'retried': true},
      headers: {...options.headers, 'Authorization': 'Bearer $accessToken'},
    );
    return _dio.fetch(newOptions);
  }

  DioException _normalize(DioException error) {
    final data = error.response?.data;
    if (data is Map && data['error'] is Map) {
      final errorBody = data['error'] as Map;
      return error.copyWith(
        error: ApiException(
          code: errorBody['code'] as String? ?? 'UNKNOWN',
          message: errorBody['message'] as String? ?? '알 수 없는 오류가 발생했습니다.',
          statusCode: error.response?.statusCode,
        ),
      );
    }
    return error.copyWith(
      error: const ApiException(code: 'NETWORK_ERROR', message: '네트워크 연결을 확인해주세요.'),
    );
  }
}
