import '../data/record_summary_models.dart';

sealed class RecordsListState {
  const RecordsListState();
}

class RecordsListLoading extends RecordsListState {
  const RecordsListLoading();
}

class RecordsListLoaded extends RecordsListState {
  const RecordsListLoaded(this.records);
  final List<RecordListItemSummary> records;
}

class RecordsListFailed extends RecordsListState {
  const RecordsListFailed(this.message);
  final String message;
}
