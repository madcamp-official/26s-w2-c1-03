import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_back_button.dart';
import '../../profile/presentation/profile_controller.dart' show usersApiProvider;
import '../data/trip_member_models.dart';
import '../data/trip_members_api.dart';
import 'invite_link_sheet.dart';

sealed class _MembersState {
  const _MembersState();
}

class _MembersLoading extends _MembersState {
  const _MembersLoading();
}

class _MembersLoaded extends _MembersState {
  const _MembersLoaded({required this.myUserId, required this.members});
  final String myUserId;
  final List<TripMember> members;

  TripMemberRole? get myRole =>
      members.where((m) => m.userId == myUserId).firstOrNull?.role;
}

class _MembersFailed extends _MembersState {
  const _MembersFailed(this.message);
  final String message;
}

/// 참여자 목록 + 역할 변경/내보내기(owner)/자진 탈퇴(API 명세서 §3.1).
/// TripDetailScreen처럼 tripId 하나에 매인 일회성 화면이라 로컬 setState로 관리한다.
/// 자진 탈퇴로 이 여행을 떠나면 true를 pop해 상세 화면도 함께 닫히게 한다.
class TripMembersScreen extends ConsumerStatefulWidget {
  const TripMembersScreen({super.key, required this.tripId});

  final String tripId;

  @override
  ConsumerState<TripMembersScreen> createState() => _TripMembersScreenState();
}

class _TripMembersScreenState extends ConsumerState<TripMembersScreen> {
  _MembersState _state = const _MembersLoading();
  bool _busy = false;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _load();
    // WS 실시간 동기화 전 폴백(plan.md Phase 10): 다른 멤버의 참여/역할 변경이
    // 늦어도 15초 안에 보이도록 조용히 재조회한다. 실패는 무시(다음 주기에 재시도).
    _pollTimer = Timer.periodic(const Duration(seconds: 15), (_) => _refreshSilently());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _refreshSilently() async {
    if (_busy || _state is! _MembersLoaded) return;
    try {
      final (me, members) = await (
        ref.read(usersApiProvider).getMe(),
        ref.read(tripMembersApiProvider).listMembers(widget.tripId),
      ).wait;
      if (!mounted || _busy) return;
      setState(() => _state = _MembersLoaded(myUserId: me.id, members: members));
    } on DioException {
      // 조용한 갱신 실패는 화면 상태를 건드리지 않는다.
    }
  }

  Future<void> _load() async {
    setState(() => _state = const _MembersLoading());
    try {
      final (me, members) = await (
        ref.read(usersApiProvider).getMe(),
        ref.read(tripMembersApiProvider).listMembers(widget.tripId),
      ).wait;
      if (!mounted) return;
      setState(() => _state = _MembersLoaded(myUserId: me.id, members: members));
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(
        () => _state = _MembersFailed(
          error is ApiException ? error.message : '네트워크 연결을 확인해주세요.',
        ),
      );
    }
  }

  Future<void> _runAction(Future<void> Function() action, {String? failMessage}) async {
    setState(() => _busy = true);
    try {
      await action();
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error is ApiException ? error.message : (failMessage ?? '요청에 실패했어요.')),
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _changeRole(TripMember member, TripMemberRole role) {
    return _runAction(() async {
      await ref.read(tripMembersApiProvider).updateMemberRole(widget.tripId, member.userId, role);
      await _load();
    });
  }

  Future<void> _removeMember(TripMember member) async {
    final confirmed = await _confirm(
      title: '${member.nickname} 님을 내보낼까요?',
      confirmLabel: '내보내기',
    );
    if (confirmed != true) return;
    await _runAction(() async {
      await ref.read(tripMembersApiProvider).removeMember(widget.tripId, member.userId);
      await _load();
    });
  }

  Future<void> _leaveTrip() async {
    final confirmed = await _confirm(title: '이 여행에서 나갈까요?', confirmLabel: '나가기');
    if (confirmed != true) return;
    await _runAction(() async {
      await ref.read(tripMembersApiProvider).leaveTrip(widget.tripId);
      if (!mounted) return;
      Navigator.of(context).pop(true); // 상세 화면도 닫히도록 true 전달
    });
  }

  Future<bool?> _confirm({required String title, required String confirmLabel}) {
    return showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('취소'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(confirmLabel, style: const TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        titleSpacing: 0,
        leading: const AppBackButton(),
        title: const Text(
          '함께하는 사람들',
          style: TextStyle(color: AppColors.ink900, fontWeight: FontWeight.w700),
        ),
        actions: [
          // 초대 링크 생성은 owner/editor만(API 명세서 §3.1) — viewer에겐 숨긴다.
          if (_state case _MembersLoaded(:final myRole)
              when myRole == TripMemberRole.owner || myRole == TripMemberRole.editor)
            IconButton(
              icon: const Icon(Icons.person_add_alt_1_outlined, color: AppColors.ink900),
              onPressed: () => showInviteLinkSheet(context, tripId: widget.tripId),
            ),
        ],
      ),
      body: SafeArea(child: _buildBody()),
    );
  }

  Widget _buildBody() {
    final state = _state;
    if (state is _MembersLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state is _MembersFailed) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(state.message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            TextButton(onPressed: _load, child: const Text('다시 시도')),
          ],
        ),
      );
    }

    final loaded = state as _MembersLoaded;
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.ink900,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(22, 8, 22, 40),
        itemCount: loaded.members.length,
        separatorBuilder: (_, _) => const SizedBox(height: 4),
        itemBuilder: (context, index) => _buildMemberTile(loaded, loaded.members[index]),
      ),
    );
  }

  Widget _buildMemberTile(_MembersLoaded loaded, TripMember member) {
    final isMe = member.userId == loaded.myUserId;
    final amOwner = loaded.myRole == TripMemberRole.owner;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(
        backgroundColor: AppColors.surfaceSubtle,
        backgroundImage:
            member.profileImageUrl != null ? NetworkImage(member.profileImageUrl!) : null,
        child: member.profileImageUrl == null
            ? const Icon(Icons.person_outline, color: AppColors.ink400)
            : null,
      ),
      title: Row(
        children: [
          Flexible(
            child: Text(
              member.nickname,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: AppColors.ink900,
              ),
            ),
          ),
          if (isMe) ...[
            const SizedBox(width: 6),
            const Text(
              '나',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.ink400),
            ),
          ],
        ],
      ),
      subtitle: Text(
        _roleLabel(member.role),
        style: const TextStyle(fontSize: 12.5, color: AppColors.ink400),
      ),
      trailing: _buildTrailing(member, isMe: isMe, amOwner: amOwner),
    );
  }

  Widget? _buildTrailing(TripMember member, {required bool isMe, required bool amOwner}) {
    if (isMe) {
      return TextButton(
        onPressed: _busy ? null : _leaveTrip,
        child: const Text('나가기', style: TextStyle(color: AppColors.danger)),
      );
    }
    if (!amOwner) return null;
    return PopupMenuButton<VoidCallback>(
      enabled: !_busy,
      icon: const Icon(Icons.more_vert, color: AppColors.ink400),
      onSelected: (action) => action(),
      itemBuilder: (context) => [
        for (final role in TripMemberRole.values)
          if (role != member.role)
            PopupMenuItem(
              value: () => _changeRole(member, role),
              child: Text('${_roleLabel(role)}(으)로 변경'),
            ),
        PopupMenuItem(
          value: () => _removeMember(member),
          child: const Text('내보내기', style: TextStyle(color: AppColors.danger)),
        ),
      ],
    );
  }

  String _roleLabel(TripMemberRole role) => switch (role) {
    TripMemberRole.owner => '주최자',
    TripMemberRole.editor => '편집 가능',
    TripMemberRole.viewer => '보기 전용',
  };
}
