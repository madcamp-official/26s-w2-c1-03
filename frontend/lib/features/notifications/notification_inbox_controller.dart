import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'notification_inbox_store.dart';
import 'received_notification.dart';

final notificationInboxStoreProvider = Provider<NotificationInboxStore>(
  (ref) => NotificationInboxStore(),
);

/// 홈 헤더의 안 읽음 배지와 알림 확인 창이 함께 watch하는 수신 알림 목록.
final notificationInboxControllerProvider =
    StateNotifierProvider<
      NotificationInboxController,
      List<ReceivedNotification>
    >((ref) {
      return NotificationInboxController(
        ref.watch(notificationInboxStoreProvider),
      )..init();
    });

/// 이 기기가 받은 FCM 알림을 모아 "알림 확인 창"에 공급한다.
///
/// 서버에 알림 조회 API가 없어서(Phase 13 미구현), FirebaseMessaging의 수신 스트림을
/// 직접 구독해 기기에 쌓는다. 캡처 시점:
///  - onMessage: 앱이 떠 있을 때 도착한 알림(포그라운드).
///  - onMessageOpenedApp / getInitialMessage: 백그라운드·종료 상태에서 온 알림을
///    사용자가 탭해 앱을 열었을 때.
///
/// 백그라운드에서 도착했지만 탭하지 않은 알림은 별도 백그라운드 isolate 저장이
/// 필요해 이번 스코프에선 기록하지 않는다(포그라운드 수신 + 탭 진입까지 커버).
class NotificationInboxController
    extends StateNotifier<List<ReceivedNotification>> {
  NotificationInboxController(this._store) : super(const []);

  final NotificationInboxStore _store;
  final List<StreamSubscription<RemoteMessage>> _subs = [];

  Future<void> init() async {
    state = await _store.readAll();

    if (kIsWeb) {
      return;
    }

    _subs.add(FirebaseMessaging.onMessage.listen(_ingest));
    _subs.add(FirebaseMessaging.onMessageOpenedApp.listen(_ingest));

    // 종료 상태에서 알림 탭으로 앱이 실행됐다면 그 메시지도 기록한다.
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) _ingest(initial);
  }

  Future<void> _ingest(RemoteMessage message) async {
    final id =
        message.messageId ?? DateTime.now().microsecondsSinceEpoch.toString();
    if (state.any((n) => n.id == id)) return; // 같은 메시지 중복 방지

    final data = message.data;
    final notification = ReceivedNotification(
      id: id,
      title: message.notification?.title ?? data['title'] as String?,
      body: message.notification?.body ?? data['body'] as String?,
      receivedAt: message.sentTime ?? DateTime.now(),
    );

    state = [notification, ...state];
    await _store.saveAll(state);
  }

  Future<void> markAllRead() async {
    if (state.every((n) => n.read)) return;
    state = [for (final n in state) n.copyWith(read: true)];
    await _store.saveAll(state);
  }

  Future<void> clearAll() async {
    state = const [];
    await _store.saveAll(const []);
  }

  @override
  void dispose() {
    for (final sub in _subs) {
      sub.cancel();
    }
    super.dispose();
  }
}
