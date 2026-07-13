import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'received_notification.dart';

/// 수신한 알림 목록을 기기에 저장한다.
///
/// 서버 알림 조회 API가 없으니(Phase 13) 이 기기가 받은 것만 로컬에 쌓아 보여주는
/// 용도다. TokenStorage와 같은 보안 저장소를 쓰지만 키(`received_notifications`)가
/// 달라 서로 간섭하지 않는다 — TokenStorage.clear()도 이 키는 건드리지 않는다.
class NotificationInboxStore {
  NotificationInboxStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'received_notifications';

  /// 무한히 쌓이지 않도록 최근 것만 유지한다.
  static const _maxItems = 50;

  final FlutterSecureStorage _storage;

  Future<List<ReceivedNotification>> readAll() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return const [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .map((e) => ReceivedNotification.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      // 저장 포맷이 깨졌으면 조용히 비운다 — 알림 목록은 지워져도 치명적이지 않다.
      return const [];
    }
  }

  Future<void> saveAll(List<ReceivedNotification> items) async {
    final capped = items.take(_maxItems).toList();
    await _storage.write(
      key: _key,
      value: jsonEncode(capped.map((e) => e.toJson()).toList()),
    );
  }
}
