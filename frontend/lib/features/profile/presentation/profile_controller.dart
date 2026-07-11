import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../auth/presentation/login_controller.dart' show apiClientProvider;
import '../data/users_api.dart';
import 'profile_state.dart';

final usersApiProvider = Provider<UsersApi>((ref) => UsersApi(ref.watch(apiClientProvider)));

final profileControllerProvider = StateNotifierProvider<ProfileController, ProfileState>((ref) {
  return ProfileController(ref.watch(usersApiProvider));
});

class ProfileController extends StateNotifier<ProfileState> {
  ProfileController(this._usersApi) : super(const ProfileLoading());

  final UsersApi _usersApi;

  Future<void> load() async {
    state = const ProfileLoading();
    try {
      final user = await _usersApi.getMe();
      state = ProfileLoaded(user);
    } on DioException catch (e) {
      state = _toFailedState(e);
    }
  }

  /// 직전 상태와 무관하게(아직 load()가 끝나지 않았어도) 항상 시도한다 — 온보딩
  /// 화면은 load()와 별개로 로그인 응답값을 즉시 보여주고 바로 저장을 걸 수 있어서,
  /// "ProfileLoaded일 때만 저장 허용" 식으로 짜면 레이스 컨디션이 생긴다.
  Future<bool> updateNickname(String nickname) async {
    try {
      final updated = await _usersApi.updateNickname(nickname);
      state = ProfileLoaded(updated);
      return true;
    } on DioException catch (e) {
      state = _toFailedState(e);
      return false;
    }
  }

  ProfileState _toFailedState(DioException e) {
    final error = e.error;
    if (error is ApiException) {
      return ProfileFailed(error.code, error.message);
    }
    return const ProfileFailed('NETWORK_ERROR', '네트워크 연결을 확인해주세요.');
  }
}
