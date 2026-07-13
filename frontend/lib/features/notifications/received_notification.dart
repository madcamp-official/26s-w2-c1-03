/// 이 기기가 수신한 푸시 알림 한 건.
///
/// 서버에 알림 조회 API가 아직 없어서(plan.md Phase 13 미구현), 앱이 받은 FCM
/// 메시지를 기기에 직접 저장해 "알림 확인 창"에 보여준다. 서버의 notification_logs와는
/// 무관한, 순수하게 이 기기 로컬 기록이다.
class ReceivedNotification {
  const ReceivedNotification({
    required this.id,
    required this.receivedAt,
    this.title,
    this.body,
    this.read = false,
  });

  /// FCM messageId(있으면). 같은 메시지를 두 번 저장하지 않도록 중복 판별에 쓴다.
  final String id;
  final String? title;
  final String? body;
  final DateTime receivedAt;
  final bool read;

  ReceivedNotification copyWith({bool? read}) => ReceivedNotification(
    id: id,
    title: title,
    body: body,
    receivedAt: receivedAt,
    read: read ?? this.read,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'body': body,
    'receivedAt': receivedAt.toIso8601String(),
    'read': read,
  };

  factory ReceivedNotification.fromJson(Map<String, dynamic> json) => ReceivedNotification(
    id: json['id'] as String,
    title: json['title'] as String?,
    body: json['body'] as String?,
    receivedAt: DateTime.parse(json['receivedAt'] as String),
    read: json['read'] as bool? ?? false,
  );
}
