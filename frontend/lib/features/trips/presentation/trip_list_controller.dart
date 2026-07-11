import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../auth/presentation/login_controller.dart' show apiClientProvider;
import '../data/trips_api.dart';
import 'trip_list_state.dart';

final tripsApiProvider = Provider<TripsApi>((ref) => TripsApi(ref.watch(apiClientProvider)));

final tripListControllerProvider = StateNotifierProvider<TripListController, TripListState>((
  ref,
) {
  return TripListController(ref.watch(tripsApiProvider));
});

class TripListController extends StateNotifier<TripListState> {
  TripListController(this._tripsApi) : super(const TripListLoading());

  final TripsApi _tripsApi;

  Future<void> load() async {
    state = const TripListLoading();
    try {
      final result = await _tripsApi.list();
      state = TripListLoaded(result.items);
    } on DioException catch (e) {
      state = _toFailedState(e);
    }
  }

  TripListState _toFailedState(DioException e) {
    final error = e.error;
    if (error is ApiException) {
      return TripListFailed(error.code, error.message);
    }
    return const TripListFailed('NETWORK_ERROR', '네트워크 연결을 확인해주세요.');
  }
}
