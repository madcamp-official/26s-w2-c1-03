import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';

/// MaterialApp.navigatorKey — 딥링크 처리처럼 위젯 트리 밖에서 화면을 띄울 때 쓴다.
final appNavigatorKey = GlobalKey<NavigatorState>();

/// 여행 초대 딥링크(`tripandend://join?token=...`, plan.md Phase 10) 수신기.
///
/// 앱이 꺼진 채 링크로 시작하거나(콜드 스타트, getInitialLink) 실행 중 수신하면
/// (uriLinkStream) 토큰을 보관해 두고, 세션이 준비된 뒤(markSessionReady —
/// 로그인 완료 후 AppShell 진입 시점) 가입 화면을 띄운다. 로그인 전에 링크를
/// 눌러도 로그인만 마치면 이어서 처리되는 구조다.
class InviteDeepLinkHandler {
  InviteDeepLinkHandler._();

  static final instance = InviteDeepLinkHandler._();

  final _appLinks = AppLinks();
  StreamSubscription<Uri>? _subscription;
  void Function(String token)? _onInviteToken;
  String? _pendingToken;
  bool _sessionReady = false;

  /// [onInviteToken]은 세션 준비 이후에만 호출된다(pending 토큰은 그때까지 보관).
  Future<void> init({required void Function(String token) onInviteToken}) async {
    _onInviteToken = onInviteToken;
    _subscription ??= _appLinks.uriLinkStream.listen(_handleUri);
    final initial = await _appLinks.getInitialLink();
    if (initial != null) _handleUri(initial);
  }

  /// 로그인된 셸(AppShell)에 진입할 때마다 호출 — 보관 중인 토큰이 있으면 처리한다.
  void markSessionReady() {
    _sessionReady = true;
    _flush();
  }

  void _handleUri(Uri uri) {
    if (uri.scheme != 'tripandend' || uri.host != 'join') return;
    final token = uri.queryParameters['token'];
    if (token == null || token.isEmpty) return;
    _pendingToken = token;
    _flush();
  }

  void _flush() {
    final token = _pendingToken;
    final handler = _onInviteToken;
    if (!_sessionReady || token == null || handler == null) return;
    _pendingToken = null;
    // AppShell.initState의 markSessionReady에서 곧바로 화면을 push하면 첫 빌드와
    // 겹치므로 프레임이 끝난 뒤 처리한다.
    WidgetsBinding.instance.addPostFrameCallback((_) => handler(token));
  }
}
