import 'dart:ui';

import 'package:flutter/material.dart';
import '../../../core/deeplink/invite_deep_link_handler.dart';
import '../../../core/theme/app_colors.dart';
import '../../profile/presentation/profile_screen.dart';
import '../../records/presentation/records_list_screen.dart';
import '../../schedule/presentation/schedule_trip_list_screen.dart';
import '../../trips/presentation/create_trip_screen.dart';
import '../../trips/presentation/trip_list_screen.dart';

/// 하단 탭바 셸(design.md §5.1/§6): 좌측 홈/스케줄, 중앙 여행 추가 버튼,
/// 우측 기록/마이 — 5개 모두 탭바와 같은 라인에 놓인다.
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _tabIndex = 0;

  @override
  void initState() {
    super.initState();
    // 로그인된 셸에 도달했다 = 세션 준비 완료. 보관 중인 초대 딥링크 토큰이 있으면
    // 이 시점에 가입 화면이 뜬다(자동 로그인/신규 로그인 두 경로 모두 여길 지난다).
    InviteDeepLinkHandler.instance.markSessionReady();
  }

  static const _tabs = [
    TripListScreen(),
    ScheduleTripListScreen(),
    RecordsListScreen(),
    ProfileScreen(),
  ];

  void _openCreateTrip() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const CreateTripScreen()));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _tabIndex, children: _tabs),
      bottomNavigationBar: ClipRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Container(
            height: 88,
            decoration: const BoxDecoration(
              color: Color(0xF5FFFFFF),
              border: Border(
                top: BorderSide(color: Color(0xFFEFF1F3), width: 1),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _TabButton(
                  icon: Icons.home_outlined,
                  label: '홈',
                  selected: _tabIndex == 0,
                  onTap: () => setState(() => _tabIndex = 0),
                ),
                _TabButton(
                  icon: Icons.map_outlined,
                  label: '스케줄',
                  selected: _tabIndex == 1,
                  onTap: () => setState(() => _tabIndex = 1),
                ),
                _AddTripButton(onTap: _openCreateTrip),
                _TabButton(
                  icon: Icons.photo_outlined,
                  label: '기록',
                  selected: _tabIndex == 2,
                  onTap: () => setState(() => _tabIndex = 2),
                ),
                _TabButton(
                  icon: Icons.person_outline,
                  label: '마이',
                  selected: _tabIndex == 3,
                  onTap: () => setState(() => _tabIndex = 3),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AddTripButton extends StatelessWidget {
  const _AddTripButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 48,
        height: 48,
        decoration: const BoxDecoration(color: AppColors.ink900, shape: BoxShape.circle),
        child: const Icon(Icons.add, color: AppColors.lime, size: 24),
      ),
    );
  }
}

class _TabButton extends StatelessWidget {
  const _TabButton({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? AppColors.lime : AppColors.ink300;
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 23, color: color),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
