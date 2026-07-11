import 'package:flutter/services.dart' show PlatformException;
import 'package:kakao_flutter_sdk_user/kakao_flutter_sdk_user.dart';
import 'provider_token_result.dart';

/// kakao_flutter_sdk_user를 감싸 결과를 [ProviderTokenResult]로 정규화한다.
///
/// 백엔드 KakaoTokenVerifier(auth/strategies/kakao-token-verifier.ts)는 여기서 얻은
/// 카카오 accessToken을 그대로 Bearer로 kapi.kakao.com/v2/user/me에 보내 검증하므로,
/// 백엔드로는 이 accessToken을 그대로 idToken 필드에 담아 전달한다(§API 명세서 §1의
/// idToken 필드는 provider마다 실제 담기는 값이 다르다 — 카카오는 accessToken).
///
/// 주의: KakaoAuthException/AuthErrorCause의 정확한 멤버명은 SDK 버전에 따라
/// 달라질 수 있다. 이 파일은 이 저장소에 Flutter SDK가 없어 `flutter pub get`으로
/// 검증하지 못했으니, 실제 설치된 kakao_flutter_sdk_user 버전 문서와 대조해서
/// catch 절 이름이 맞는지 한 번 확인해달라.
class KakaoLoginService {
  Future<ProviderTokenResult> signIn() async {
    try {
      final installed = await isKakaoTalkInstalled();
      final token = installed
          ? await UserApi.instance.loginWithKakaoTalk()
          : await UserApi.instance.loginWithKakaoAccount();
      return ProviderTokenSuccess(token.accessToken);
    } on KakaoAuthException catch (e) {
      if (e.error == AuthErrorCause.accessDenied) {
        return const ProviderTokenCancelled();
      }
      return ProviderTokenFailure(e.message ?? '카카오 인증에 실패했습니다.');
    } on PlatformException catch (e) {
      if (e.code == 'CANCELED') {
        return const ProviderTokenCancelled();
      }
      return ProviderTokenFailure(e.message ?? '카카오 로그인 중 오류가 발생했습니다.');
    } catch (e) {
      return ProviderTokenFailure(e.toString());
    }
  }

  Future<void> signOut() async {
    try {
      await UserApi.instance.logout();
    } catch (_) {
      // 카카오 세션 해제 실패는 우리 서비스 로그아웃을 막을 이유가 아니다 — 무시.
    }
  }
}
