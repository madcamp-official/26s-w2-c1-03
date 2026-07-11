import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../profile_image_upload_service.dart';
import 'profile_controller.dart';
import 'profile_state.dart';

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
  String? _errorText;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(profileControllerProvider.notifier).load());
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final nickname = _controller.text.trim();
    if (nickname.isEmpty) {
      setState(() => _errorText = '닉네임을 입력해주세요.');
      return;
    }
    if (nickname.length > 30) {
      setState(() => _errorText = '닉네임은 30자 이내로 입력해주세요.');
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
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('닉네임을 변경했어요.')));
    } else {
      setState(() => _errorText = '저장하지 못했어요. 다시 시도해주세요.');
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(saved ? '프로필 사진을 변경했어요.' : '저장하지 못했어요. 다시 시도해주세요.')),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(profileControllerProvider);

    if (state is ProfileLoaded && !_controllerInitialized) {
      _controller.text = state.user.nickname;
      _controllerInitialized = true;
    }

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          '프로필',
          style: TextStyle(color: Color(0xFF191F28), fontWeight: FontWeight.w700),
        ),
        iconTheme: const IconThemeData(color: Color(0xFF191F28)),
      ),
      body: SafeArea(child: _buildBody(state)),
    );
  }

  Widget _buildBody(ProfileState state) {
    return switch (state) {
      ProfileLoading() => const Center(child: CircularProgressIndicator()),
      ProfileFailed(:final message) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => ref.read(profileControllerProvider.notifier).load(),
                child: const Text('다시 시도'),
              ),
            ],
          ),
        ),
      ),
      ProfileLoaded(:final user) => Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Column(
                children: [
                  Stack(
                    alignment: Alignment.center,
                    children: [
                      CircleAvatar(
                        radius: 44,
                        backgroundColor: const Color(0xFFF2F4F6),
                        backgroundImage: user.profileImageUrl != null
                            ? NetworkImage(user.profileImageUrl!)
                            : null,
                        child: user.profileImageUrl == null
                            ? const Icon(Icons.person, size: 40, color: Color(0xFFB0B8C1))
                            : null,
                      ),
                      if (_uploadingImage)
                        const CircleAvatar(
                          radius: 44,
                          backgroundColor: Color(0x66000000),
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: _uploadingImage ? null : () => _changePhoto(user.id),
                    child: const Text('사진 변경'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              '닉네임',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF4E5968)),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _controller,
              maxLength: 30,
              decoration: InputDecoration(
                errorText: _errorText,
                filled: true,
                fillColor: const Color(0xFFF2F4F6),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _submitting ? null : _save,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF191F28),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('저장', style: TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        ),
      ),
    };
  }
}
