import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/app_config.dart';
import '../storage/token_storage.dart';

/// 여행별 실시간 채널(plan.md Phase 10, API 명세서 §3.2) 구독기.
///
/// 백엔드 CollaborationGateway(Socket.IO, 네임스페이스 `/ws/trips`)에
/// `auth.token`(JWT) + query `tripId`로 접속한다. 이벤트별 원시 payload 대신
/// "무엇이 바뀌었다"는 신호만 콜백으로 넘긴다 — 수신 화면은 REST 재조회로
/// 최신 상태를 얻는 것이 단순하고, 폴링 폴백(15초)과도 자연스럽게 겹친다.
/// 인증 거부(`connection:rejected`, 4403)를 받으면 재연결하지 않고 멈춘다.
class TripSocket {
  TripSocket({
    required this.tripId,
    required this.tokenStorage,
    this.onScheduleChanged,
    this.onMembersChanged,
  });

  final String tripId;
  final TokenStorage tokenStorage;

  /// schedule:changed / schedule:generated / schedule:op / schedule:conflict —
  /// 어느 쪽이든 일정이 달라졌다는 뜻이므로 하나의 콜백으로 합친다.
  final VoidCallback? onScheduleChanged;

  /// member:joined / member:left.
  final VoidCallback? onMembersChanged;

  io.Socket? _socket;
  bool _disposed = false;

  Future<void> connect() async {
    final accessToken = await tokenStorage.readAccessToken();
    if (accessToken == null || _disposed) return;

    final socket = io.io(
      '${AppConfig.apiBaseUrl}/ws/trips',
      io.OptionBuilder()
          .setTransports(['websocket']) // 모바일에서 폴링 업그레이드 없이 바로 WS
          .setQuery({'tripId': tripId})
          .setAuth({'token': accessToken})
          .enableReconnection()
          .build(),
    );
    _socket = socket;

    void scheduleChanged(dynamic _) => onScheduleChanged?.call();
    socket.on('schedule:changed', scheduleChanged);
    socket.on('schedule:generated', scheduleChanged);
    socket.on('schedule:op', scheduleChanged);
    socket.on('schedule:conflict', scheduleChanged);
    socket.on('member:joined', (_) => onMembersChanged?.call());
    socket.on('member:left', (_) => onMembersChanged?.call());
    // 4403(토큰 만료/미소속) — 재연결해도 계속 거부되므로 조용히 끊는다.
    // 화면들은 REST + 폴링 폴백으로 계속 동작한다.
    socket.on('connection:rejected', (_) => dispose());
  }

  void dispose() {
    _disposed = true;
    _socket?.dispose();
    _socket = null;
  }
}
