import 'package:dio/dio.dart';
import '../config/app_config.dart';
import '../storage/token_storage.dart';
import 'api_exception.dart';

/// 액세스 토큰 자동 첨부 + 401 시 리프레시 1회 재시도까지 처리하는 공용 Dio 인스턴스.
/// plan.md §8.1 "JWT 자동 첨부/재발급".
class ApiClient {
  ApiClient({required TokenStorage tokenStorage, Dio? dio})
    : _tokenStorage = tokenStorage,
      // 타임아웃이 없으면 백엔드가 응답하지 않을 때 요청이 영원히 매달린다.
      // 특히 시작 화면(_StartupGate)의 getMe()가 걸려버리면 로그인 화면으로
      // 넘어가지도 못하고 로딩 스피너만 무한히 떠 있게 된다.
      _dio = dio ?? Dio(BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 10),
        sendTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
      )) {
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
          if (!isUnauthorized || isAuthEndpoint) {
            handler.next(_normalize(error));
            return;
          }
          if (_isRetry(error.requestOptions)) {
            // refresh 직후 재시도한 요청이 또 401을 받았다는 건 재발급된 토큰마저
            // 무효라는 뜻이라, 붙잡고 있어봤자 매 요청마다 refresh만 반복된다.
            // 다른 실패 분기와 동일하게 저장된 토큰을 지워 재로그인을 유도한다.
            await _tokenStorage.clear();
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
