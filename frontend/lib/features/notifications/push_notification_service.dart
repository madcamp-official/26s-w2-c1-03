import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import '../../core/storage/token_storage.dart';
import '../profile/data/users_api.dart';

sealed class DeviceRegistration {
  const DeviceRegistration();
}

class DeviceRegistrationAvailable extends DeviceRegistration {
  const DeviceRegistrationAvailable({required this.pushToken, required this.platform});
  final String pushToken;
  final String platform;
}

class DeviceRegistrationUnavailable extends DeviceRegistration {
  const DeviceRegistrationUnavailable();
}

/// plan.md Phase 5: 푸시 권한 요청 + FCM 토큰 발급 + `POST/DELETE /users/me/devices`
/// 연동. 실제 알림 수신·표시(포그라운드 핸들러, 알림 탭 처리 등)는 Phase 13의
/// 책임이라 이 서비스는 다루지 않는다 — 여기선 디바이스를 서버에 등록/해제하는
/// 것까지만 한다.
class PushNotificationService {
  Future<DeviceRegistration> requestPermissionAndGetToken() async {
    if (kIsWeb) {
      return const DeviceRegistrationUnavailable();
    }

    final platform = defaultTargetPlatform;
    if (platform != TargetPlatform.iOS && platform != TargetPlatform.android) {
      return const DeviceRegistrationUnavailable();
    }

    final settings = await FirebaseMessaging.instance.requestPermission();
    final granted =
        settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
    if (!granted) {
      return const DeviceRegistrationUnavailable();
    }

    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) {
      return const DeviceRegistrationUnavailable();
    }

    return DeviceRegistrationAvailable(
      pushToken: token,
      platform: platform == TargetPlatform.iOS ? 'ios' : 'android',
    );
  }

  /// 세션이 확립된 시점(로그인 성공/앱 시작 시 유효한 토큰 확인 후)마다 호출한다.
  /// 권한 거부, FCM 토큰 발급 실패, 네트워크 오류 등 어떤 이유로 실패하든 로그인/앱
  /// 시작 흐름 자체를 막으면 안 되므로 예외를 전부 삼킨다 — 실패해도 다음 세션
  /// 확립 시점에 다시 시도된다.
  Future<void> syncDevice({required UsersApi usersApi, required TokenStorage tokenStorage}) async {
    try {
      final registration = await requestPermissionAndGetToken();
      if (registration is! DeviceRegistrationAvailable) {
        return;
      }
      final device = await usersApi.registerDevice(
        pushToken: registration.pushToken,
        platform: registration.platform,
      );
      await tokenStorage.saveDeviceId(device.id);
    } catch (_) {
      // 조용히 무시 — 위 doc 참고.
    }
  }
}
