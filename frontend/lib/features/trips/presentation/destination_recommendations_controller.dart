import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../auth/presentation/login_controller.dart' show apiClientProvider;
import '../data/destinations_api.dart';
import 'destination_recommendations_state.dart';

final destinationsApiProvider = Provider<DestinationsApi>(
  (ref) => DestinationsApi(ref.watch(apiClientProvider)),
);

final destinationRecommendationsControllerProvider = StateNotifierProvider<
    DestinationRecommendationsController, DestinationRecommendationsState>((ref) {
  return DestinationRecommendationsController(ref.watch(destinationsApiProvider));
});

class DestinationRecommendationsController
    extends StateNotifier<DestinationRecommendationsState> {
  DestinationRecommendationsController(this._destinationsApi)
    : super(const DestinationRecommendationsLoading());

  final DestinationsApi _destinationsApi;

  Future<void> load() async {
    state = const DestinationRecommendationsLoading();
    try {
      final items = await _destinationsApi.getRecommendations();
      state = DestinationRecommendationsLoaded(items);
    } on DioException {
      state = const DestinationRecommendationsFailed();
    }
  }
}
