/// API 명세서 §3.1(공동 계획) 응답 스키마 — 초대 링크와 참여자.
library;

/// trip_members.role (member_role enum). 백엔드 TripMemberRole과 값을 맞춘다.
enum TripMemberRole {
  owner,
  editor,
  viewer;

  static TripMemberRole fromJson(String value) =>
      TripMemberRole.values.firstWhere((role) => role.name == value);
}

/// POST /trips/{tripId}/invite-links 응답: { token, url, expiresAt }.
class InviteLink {
  const InviteLink({required this.token, required this.url, required this.expiresAt});

  final String token;

  /// 딥링크 url(기본 `tripandend://join?token=...`). 공유 시트에 이 값을 그대로 싣는다.
  final String url;
  final DateTime? expiresAt;

  factory InviteLink.fromJson(Map<String, dynamic> json) => InviteLink(
    token: json['token'] as String,
    url: json['url'] as String,
    expiresAt: json['expiresAt'] == null ? null : DateTime.parse(json['expiresAt'] as String),
  );
}

/// GET /trips/{tripId}/members 응답의 member 항목.
class TripMember {
  const TripMember({
    required this.userId,
    required this.nickname,
    required this.profileImageUrl,
    required this.role,
    required this.joinedAt,
  });

  final String userId;
  final String nickname;
  final String? profileImageUrl;
  final TripMemberRole role;
  final DateTime joinedAt;

  factory TripMember.fromJson(Map<String, dynamic> json) => TripMember(
    userId: json['userId'] as String,
    nickname: json['nickname'] as String,
    profileImageUrl: json['profileImageUrl'] as String?,
    role: TripMemberRole.fromJson(json['role'] as String),
    joinedAt: DateTime.parse(json['joinedAt'] as String),
  );
}
