import '../data/trip_models.dart';

sealed class TripListState {
  const TripListState();
}

class TripListLoading extends TripListState {
  const TripListLoading();
}

class TripListLoaded extends TripListState {
  const TripListLoaded(this.trips);
  final List<Trip> trips;
}

class TripListFailed extends TripListState {
  const TripListFailed(this.code, this.message);
  final String code;
  final String message;
}
