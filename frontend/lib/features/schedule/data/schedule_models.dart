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
    required this.cost,
    required this.category,
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
  /// 이 장소에서 쓴/쓸 비용(원 단위). 미입력 시 null.
  final int? cost;

  /// 'attraction' | 'restaurant' | 'cafe'. custom(직접 입력) 장소는 null — 지도
  /// 마커·목록 배지 색 구분에 쓴다.
  final String? category;

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
        cost: json['cost'] as int?,
        category: json['category'] as String?,
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
        cost: cost,
        category: category,
      );
}

/// applyRevision(POST /schedule/revise/apply) 요청 항목. 원래는 §2.5 프롬프트 기반
/// 제안(revise) 미리보기용이었으나, 그 화면은 챗봇(chat)으로 대체됐다 — 지금은
/// [ScheduleApi.restoreSnapshot]이 "되돌리기"를 구현하려고 이 형태를 재사용한다.
class ProposalItem {
  const ProposalItem({
    required this.placeId,
    required this.customName,
    required this.customAddress,
    required this.dayNumber,
    required this.orderInDay,
    required this.startTime,
    required this.name,
    required this.address,
  });

  final String? placeId;
  final String? customName;
  final String? customAddress;
  final int dayNumber;
  final int orderInDay;
  final String? startTime;
  final String name;
  final String? address;

  factory ProposalItem.fromJson(Map<String, dynamic> json) => ProposalItem(
        placeId: json['placeId'] as String?,
        customName: json['customName'] as String?,
        customAddress: json['customAddress'] as String?,
        dayNumber: json['dayNumber'] as int,
        orderInDay: json['orderInDay'] as int,
        startTime: json['startTime'] as String?,
        name: json['name'] as String,
        address: json['address'] as String?,
      );

  /// apply 요청 바디(ApplyScheduleItemDto)로 직렬화. placeId 또는 custom 중 하나만 보낸다.
  Map<String, dynamic> toApplyJson() => {
        if (placeId != null) 'placeId': placeId,
        if (placeId == null && customName != null) 'customName': customName,
        if (placeId == null && customAddress != null) 'customAddress': customAddress,
        'dayNumber': dayNumber,
        'orderInDay': orderInDay,
        if (startTime != null) 'startTime': startTime,
      };
}

/// 챗봇 스케줄 편집(Phase 9 chat) 대화 메시지 — 세션(화면) 한정, 서버에 저장되지 않는다.
/// user/assistant만 존재한다(system/tool 메시지는 서버가 내부적으로만 구성).
class ChatMessage {
  const ChatMessage({required this.role, required this.content});

  final String role; // 'user' | 'assistant'
  final String content;

  Map<String, dynamic> toJson() => {'role': role, 'content': content};
}

/// POST /schedule/chat 응답: { reply, schedule: {days:[...]}, changed }.
class ChatReply {
  const ChatReply({required this.reply, required this.schedule, required this.changed});

  final String reply;
  final SchedulePlan schedule;
  final bool changed;

  factory ChatReply.fromJson(Map<String, dynamic> json) => ChatReply(
        reply: json['reply'] as String,
        schedule: SchedulePlan.fromJson(json['schedule'] as Map<String, dynamic>),
        changed: json['changed'] as bool,
      );
}
