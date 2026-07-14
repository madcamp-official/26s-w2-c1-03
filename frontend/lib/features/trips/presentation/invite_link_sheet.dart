import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../data/trip_members_api.dart';

/// "친구 초대" 바텀시트(API 명세서 §3.1) — 만료 기간을 고르면 초대 링크를 생성해
/// OS 공유 시트(share_plus)로 보내거나 클립보드에 복사한다. 생성 권한(owner/editor)이
/// 없으면 서버 403 메시지를 그대로 보여준다.
Future<void> showInviteLinkSheet(BuildContext context, {required String tripId}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => _InviteLinkSheetContent(tripId: tripId),
  );
}

/// (라벨, expiresInHours — null이면 무기한) 선택지.
const _expiryOptions = <(String, int?)>[('24시간', 24), ('7일', 168), ('무기한', null)];

class _InviteLinkSheetContent extends ConsumerStatefulWidget {
  const _InviteLinkSheetContent({required this.tripId});

  final String tripId;

  @override
  ConsumerState<_InviteLinkSheetContent> createState() => _InviteLinkSheetContentState();
}

class _InviteLinkSheetContentState extends ConsumerState<_InviteLinkSheetContent> {
  int _selectedExpiry = 0;
  bool _creating = false;
  String? _createdUrl;

  Future<void> _createLink() async {
    setState(() => _creating = true);
    try {
      final link = await ref
          .read(tripMembersApiProvider)
          .createInviteLink(widget.tripId, expiresInHours: _expiryOptions[_selectedExpiry].$2);
      if (!mounted) return;
      setState(() {
        _createdUrl = link.url;
        _creating = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(() => _creating = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error is ApiException ? error.message : '초대 링크를 만들지 못했어요.'),
        ),
      );
    }
  }

  Future<void> _share() async {
    final url = _createdUrl;
    if (url == null) return;
    await Share.share('여행 계획을 함께 세워요! 아래 링크로 참여해줘 🧳\n$url');
  }

  Future<void> _copy() async {
    final url = _createdUrl;
    if (url == null) return;
    await Clipboard.setData(ClipboardData(text: url));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('링크를 복사했어요.')));
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 12, 22, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.surfaceSubtle,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              '친구를 초대할까?',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink900),
            ),
            const SizedBox(height: 6),
            const Text(
              '링크로 참여한 친구는 일정을 함께 편집할 수 있어요.',
              style: TextStyle(fontSize: 13, color: AppColors.ink400, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 16),
            if (_createdUrl == null) ...[
              Row(
                children: [
                  for (final (index, option) in _expiryOptions.indexed) ...[
                    if (index > 0) const SizedBox(width: 8),
                    ChoiceChip(
                      label: Text(option.$1),
                      selected: _selectedExpiry == index,
                      onSelected: _creating
                          ? null
                          : (_) => setState(() => _selectedExpiry = index),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 16),
              AppButton(label: '초대 링크 만들기', loading: _creating, onPressed: _createLink),
            ] else ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: AppColors.surfaceSubtle,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  _createdUrl!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink900,
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: AppButton(
                      label: '복사',
                      variant: AppButtonVariant.outline,
                      height: 48,
                      onPressed: _copy,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: AppButton(label: '공유하기', height: 48, onPressed: _share)),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
