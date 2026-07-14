import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../data/records_api.dart';
import 'record_upload_screen.dart' show recordsApiProvider;
import 'records_list_state.dart';

final recordsListControllerProvider =
    StateNotifierProvider<RecordsListController, RecordsListState>((ref) {
      return RecordsListController(ref.watch(recordsApiProvider));
    });

class RecordsListController extends StateNotifier<RecordsListState> {
  RecordsListController(this._recordsApi) : super(const RecordsListLoading());

  final RecordsApi _recordsApi;

  Future<void> load() async {
    state = const RecordsListLoading();
    try {
      final result = await _recordsApi.listRecords();
      state = RecordsListLoaded(result.items);
    } on DioException catch (e) {
      final error = e.error;
      state = RecordsListFailed(error is ApiException ? error.message : '네트워크 연결을 확인해주세요.');
    }
  }
}
