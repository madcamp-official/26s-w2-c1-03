import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../notification_inbox_controller.dart';
import '../received_notification.dart';

/// "알림 확인 창". 이 기기가 받은 푸시 알림 목록을 보여준다(서버 알림 조회 API가
/// 없어 로컬 수신 기록을 쓴다 — notification_inbox_controller.dart 참고).
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    // 이 창을 여는 순간 확인한 것으로 간주해 홈 헤더의 안 읽음 배지를 지운다.
    Future.microtask(
      () => ref.read(notificationInboxControllerProvider.notifier).markAllRead(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(notificationInboxControllerProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          '알림',
          style: TextStyle(color: AppColors.ink900, fontWeight: FontWeight.w800),
        ),
        iconTheme: const IconThemeData(color: AppColors.ink900),
        actions: [
          if (items.isNotEmpty)
            TextButton(
              onPressed: () =>
                  ref.read(notificationInboxControllerProvider.notifier).clearAll(),
              child: const Text(
                '모두 지우기',
                style: TextStyle(
                  color: AppColors.ink400,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ),
        ],
      ),
      body: SafeArea(
        child: items.isEmpty
            ? const _EmptyState()
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(22, 8, 22, 24),
                itemCount: items.length,
                separatorBuilder: (context, index) =>
                    const Divider(height: 1, color: AppColors.border),
                itemBuilder: (context, index) => _NotificationTile(item: items[index]),
              ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: const [
            Text('🔔', style: TextStyle(fontSize: 40)),
            SizedBox(height: 12),
            Text(
              '아직 받은 알림이 없어',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink900),
            ),
            SizedBox(height: 4),
            Text(
              '여행 소식이 도착하면 여기에 모아둘게',
              style: TextStyle(fontSize: 13, color: AppColors.ink400, fontWeight: FontWeight.w600),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.item});
  final ReceivedNotification item;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: const BoxDecoration(color: AppColors.surfaceMuted, shape: BoxShape.circle),
            child: const Icon(Icons.notifications_none_rounded, size: 20, color: AppColors.ink600),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title?.isNotEmpty == true ? item.title! : '알림',
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink900,
                  ),
                ),
                if (item.body?.isNotEmpty == true) ...[
                  const SizedBox(height: 3),
                  Text(
                    item.body!,
                    style: const TextStyle(
                      fontSize: 13.5,
                      color: AppColors.ink600,
                      fontWeight: FontWeight.w500,
                      height: 1.35,
                    ),
                  ),
                ],
                const SizedBox(height: 6),
                Text(
                  _relativeTime(item.receivedAt),
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.ink400,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _relativeTime(DateTime time) {
    final diff = DateTime.now().difference(time);
    if (diff.inMinutes < 1) return '방금 전';
    if (diff.inMinutes < 60) return '${diff.inMinutes}분 전';
    if (diff.inHours < 24) return '${diff.inHours}시간 전';
    if (diff.inDays < 7) return '${diff.inDays}일 전';
    String two(int n) => n.toString().padLeft(2, '0');
    return '${time.year}.${two(time.month)}.${two(time.day)}';
  }
}
