import 'package:flutter/services.dart' show PlatformException;
import 'package:google_sign_in/google_sign_in.dart';
import '../../core/config/app_config.dart';
import 'provider_token_result.dart';

/// google_sign_in(6.x API: GoogleSignIn().signIn())을 감싸 결과를 [ProviderTokenResult]로
/// 정규화한다. serverClientId에는 "웹 애플리케이션" 타입 OAuth 클라이언트 ID를 넣어야
/// idToken이 발급된다(Android 클라이언트 ID와는 별개 — AppConfig.googleServerClientId 참고).
///
/// google_sign_in 7.x부터는 GoogleSignIn.instance 싱글턴 + authenticate() 방식으로
/// API가 크게 바뀌었다. pubspec.yaml에 ^6.2.2로 고정해뒀으니, 별생각 없이 7.x로
/// 올리면 이 파일이 통째로 깨진다 — 올리려면 이 서비스도 같이 새로 써야 한다.
class GoogleLoginService {
  GoogleLoginService()
    : _googleSignIn = GoogleSignIn(
        serverClientId: AppConfig.googleServerClientId,
        scopes: const ['email'],
      );

  final GoogleSignIn _googleSignIn;

  Future<ProviderTokenResult> signIn() async {
    try {
      final account = await _googleSignIn.signIn();
      if (account == null) {
        return const ProviderTokenCancelled();
      }

      final auth = await account.authentication;
      final idToken = auth.idToken;
      if (idToken == null) {
        return const ProviderTokenFailure(
          '구글 idToken을 받지 못했습니다. GOOGLE_SERVER_CLIENT_ID(웹 클라이언트) 설정을 확인해주세요.',
        );
      }
      return ProviderTokenSuccess(idToken);
    } on PlatformException catch (e) {
      if (e.code == GoogleSignIn.kSignInCanceledError) {
        return const ProviderTokenCancelled();
      }
      return ProviderTokenFailure(e.message ?? '구글 로그인 중 오류가 발생했습니다.');
    } catch (e) {
      return ProviderTokenFailure(e.toString());
    }
  }

  Future<void> signOut() => _googleSignIn.signOut();
}
