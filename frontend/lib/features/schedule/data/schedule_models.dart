/// Phase 8 BE 응답 스키마:
/// { "schedule": { "days": [ { "dayNumber": 1, "places": [...] } ] } }
class SchedulePlan {
  const SchedulePlan({required this.days});

  final List<ScheduleDay> days;

  factory SchedulePlan.fromJson(Map<String, dynamic> json) {
    final daysJson = json['days'] as List<dynamic>? ?? const [];
    return SchedulePlan(
      days: daysJson
          .map((e) => ScheduleDay.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class ScheduleDay {
  const ScheduleDay({required this.dayNumber, required this.places});

  final int dayNumber;
  final List<ScheduledTripPlace> places;

  factory ScheduleDay.fromJson(Map<String, dynamic> json) {
    final placesJson = json['places'] as List<dynamic>? ?? const [];
    return ScheduleDay(
      dayNumber: json['dayNumber'] as int,
      places: placesJson
          .map((e) => ScheduledTripPlace.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class ScheduledTripPlace {
  const ScheduledTripPlace({
    required this.id,
    required this.placeId,
    required this.dayNumber,
    required this.orderInDay,
    required this.startTime,
    required this.name,
    required this.address,
    required this.lat,
    required this.lng,
    required this.imageUrl,
    required this.memo,
  });

  final String id;
  final String? placeId;
  final int dayNumber;
  final int orderInDay;

  /// AI가 배정한 권장 방문 시각('HH:MM'). 없으면 null.
  final String? startTime;
  final String name;
  final String? address;
  final double? lat;
  final double? lng;
  final String? imageUrl;
  final String? memo;

  factory ScheduledTripPlace.fromJson(Map<String, dynamic> json) =>
      ScheduledTripPlace(
        id: json['id'] as String,
        placeId: json['placeId'] as String?,
        dayNumber: json['dayNumber'] as int,
        orderInDay: json['orderInDay'] as int,
        startTime: json['startTime'] as String?,
        name: json['name'] as String,
        address: json['address'] as String?,
        lat: (json['lat'] as num?)?.toDouble(),
        lng: (json['lng'] as num?)?.toDouble(),
        imageUrl: json['imageUrl'] as String?,
        memo: json['memo'] as String?,
      );

  ScheduledTripPlace copyWith({int? dayNumber, int? orderInDay}) =>
      ScheduledTripPlace(
        id: id,
        placeId: placeId,
        dayNumber: dayNumber ?? this.dayNumber,
        orderInDay: orderInDay ?? this.orderInDay,
        startTime: startTime,
        name: name,
        address: address,
        lat: lat,
        lng: lng,
        imageUrl: imageUrl,
        memo: memo,
      );
}
