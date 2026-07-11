/// API 명세서 §1 응답 스키마를 그대로 옮긴 모델.
class AuthTokens {
  const AuthTokens({required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;
}

class AuthUser {
  const AuthUser({
    required this.id,
    required this.nickname,
    required this.profileImageUrl,
    required this.createdAt,
  });

  final String id;
  final String nickname;
  final String? profileImageUrl;
  final DateTime createdAt;

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
    id: json['id'] as String,
    nickname: json['nickname'] as String,
    profileImageUrl: json['profileImageUrl'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}

class SocialLoginResult {
  const SocialLoginResult({required this.tokens, required this.isNewUser, required this.user});

  final AuthTokens tokens;
  final bool isNewUser;
  final AuthUser user;
}
