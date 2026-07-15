import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/tab_header.dart';
import '../../auth/presentation/login_controller.dart';
import '../../auth/presentation/login_screen.dart';
import '../../trips/presentation/trip_list_controller.dart';
import '../../trips/presentation/trip_list_state.dart';
import '../profile_image_upload_service.dart';
import 'profile_controller.dart';
import 'profile_state.dart';

/// 마이 탭(design.md 시안 `3d`). 알림 설정/사진첩 접근 관리/친구 초대처럼 아직
/// 구현되지 않은 메뉴는 눌러도 갈 곳이 없는 "죽은 링크"가 되므로 넣지 않는다 —
/// 실제로 동작하는 항목(닉네임·사진 변경, 로그아웃, 탈퇴)만 리스트로 보여준다.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _controller = TextEditingController();
  bool _controllerInitialized = false;
  bool _submitting = false;
  bool _uploadingImage = false;
  bool _withdrawing = false;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(profileControllerProvider.notifier).load();
      ref.read(tripListControllerProvider.notifier).load();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final nickname = _controller.text.trim();
    if (nickname.isEmpty) {
      setState(() => _errorText = '닉네임을 입력해줘');
      return;
    }
    if (nickname.length > 30) {
      setState(() => _errorText = '닉네임은 30자 이내로 입력해줘');
      return;
    }

    setState(() {
      _errorText = null;
      _submitting = true;
    });

    final saved = await ref.read(profileControllerProvider.notifier).updateNickname(nickname);
    if (!mounted) return;

    setState(() => _submitting = false);
    if (saved) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('닉네임을 변경했어')));
    } else {
      setState(() => _errorText = '저장하지 못했어. 다시 시도해줘');
    }
  }

  Future<void> _changePhoto(String userId) async {
    if (_uploadingImage) return;
    setState(() => _uploadingImage = true);

    final result = await ref
        .read(profileImageUploadServiceProvider)
        .pickAndUpload(userId: userId);

    if (!mounted) return;

    switch (result) {
      case ProfileImagePickCancelled():
        setState(() => _uploadingImage = false);
      case ProfileImagePickFailed(:final message):
        setState(() => _uploadingImage = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      case ProfileImagePicked(:final downloadUrl):
        final saved = await ref
            .read(profileControllerProvider.notifier)
            .updateProfileImageUrl(downloadUrl);
        if (!mounted) return;
        setState(() => _uploadingImage = false);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(saved ? '프로필 사진을 변경했어' : '저장하지 못했어. 다시 시도해줘')));
    }
  }

  Future<void> _logout() async {
    await ref.read(authControllerProvider.notifier).logout();
    if (!mounted) return;
    // 마이 탭은 AppShell 안에 push 없이 떠 있는 상태라, 로그인 화면으로 갈 땐
    // 이 화면을 포함한 전체 스택을 비워야 뒤로가기로 다시 못 돌아온다.
    Navigator.of(
      context,
    ).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (route) => false);
  }

  Future<void> _confirmAndWithdraw() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('정말 탈퇴할까?'),
        content: const Text('탈퇴하면 계정 정보가 삭제되고 되돌릴 수 없어'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('취소'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('탈퇴', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _withdrawing = true);

    final withdrawn = await ref.read(profileControllerProvider.notifier).withdraw();
    if (!mounted) return;

    if (!withdrawn) {
      setState(() => _withdrawing = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('탈퇴하지 못했어. 다시 시도해줘')));
      return;
    }

    // 계정은 이미 서버에서 삭제됐으니, 이 기기의 세션(토큰)도 정리한다.
    await ref.read(authControllerProvider.notifier).logout();
    if (!mounted) return;

    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(profileControllerProvider);
    final tripState = ref.watch(tripListControllerProvider);

    if (state is ProfileLoaded && !_controllerInitialized) {
      _controller.text = state.user.nickname;
      _controllerInitialized = true;
    }

    return Scaffold(
      backgroundColor: AppColors.surfaceFaint,
      body: SafeArea(child: _buildBody(state, tripState)),
    );
  }

  Widget _buildBody(ProfileState state, TripListState tripState) {
    return switch (state) {
      ProfileLoading() => ListView(
        padding: const EdgeInsets.fromLTRB(22, 0, 22, 120),
        children: const [
          TabHeader(title: '마이페이지'),
          SizedBox(height: 100),
          Center(child: CircularProgressIndicator(color: AppColors.ink900)),
        ],
      ),
      ProfileFailed(:final message) => ListView(
        padding: const EdgeInsets.fromLTRB(22, 0, 22, 120),
        children: [
          const TabHeader(title: '마이페이지'),
          Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.ink600, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () => ref.read(profileControllerProvider.notifier).load(),
                  child: const Text('다시 시도'),
                ),
              ],
            ),
          ),
        ],
      ),
      ProfileLoaded(:final user) => ListView(
        padding: const EdgeInsets.fromLTRB(22, 0, 22, 120),
        children: [
          const TabHeader(title: '마이페이지'),
          const SizedBox(height: 8),
          Center(
            child: Column(
              children: [
                Stack(
                  alignment: Alignment.center,
                  children: [
                    CircleAvatar(
                      radius: 44,
                      backgroundColor: AppColors.limeBg,
                      backgroundImage: user.profileImageUrl != null
                          ? NetworkImage(user.profileImageUrl!)
                          : null,
                      child: user.profileImageUrl == null
                          ? Text(
                              user.nickname.isNotEmpty ? user.nickname.substring(0, 1) : '',
                              style: const TextStyle(
                                fontSize: 32,
                                fontWeight: FontWeight.w800,
                                color: AppColors.lime,
                              ),
                            )
                          : null,
                    ),
                    if (_uploadingImage)
                      const CircleAvatar(
                        radius: 44,
                        backgroundColor: Color(0x66000000),
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                TextButton(
                  onPressed: _uploadingImage ? null : () => _changePhoto(user.id),
                  child: const Text(
                    '사진 변경',
                    style: TextStyle(color: AppColors.ink600, fontWeight: FontWeight.w700, fontSize: 13),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _StatsRow(tripState: tripState),
          const SizedBox(height: 20),
          _ProfileCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '닉네임',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.ink600),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _controller,
                  maxLength: 30,
                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: AppColors.ink900),
                  decoration: InputDecoration(
                    errorText: _errorText,
                    filled: true,
                    fillColor: AppColors.surfaceSubtle,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                AppButton(label: '저장', height: 48, loading: _submitting, onPressed: _save),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _ProfileCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                InkWell(
                  onTap: _logout,
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                    child: Text(
                      '로그아웃',
                      style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: AppColors.ink900),
                    ),
                  ),
                ),
                const Divider(height: 1, color: AppColors.border),
                InkWell(
                  onTap: _withdrawing ? null : _confirmAndWithdraw,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                    child: _withdrawing
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.ink400),
                          )
                        : const Text(
                            '회원 탈퇴',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.ink400,
                            ),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    };
  }
}

/// 옅은 회색 페이지 배경 위에 얹는 흰 카드 — 홈 탭 `_HomeSection`과 같은 스타일.
class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.child, this.padding = const EdgeInsets.all(18)});

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.035),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.tripState});
  final TripListState tripState;

  @override
  Widget build(BuildContext context) {
    final total = tripState is TripListLoaded ? (tripState as TripListLoaded).trips.length : null;

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.035),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(child: _StatItem(value: total?.toString() ?? '-', label: '내 여행')),
          const _StatDivider(),
          const Expanded(child: _StatItem(value: '0', label: '여행 기록')),
          const _StatDivider(),
          const Expanded(child: _StatItem(value: '0', label: '저장한 사진')),
        ],
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  const _StatItem({required this.value, required this.label});
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.ink900),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.ink400),
        ),
      ],
    );
  }
}

class _StatDivider extends StatelessWidget {
  const _StatDivider();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(height: 32, child: VerticalDivider(color: AppColors.borderStrong, width: 1));
  }
}
