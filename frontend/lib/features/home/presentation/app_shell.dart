import 'dart:ui';

import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../profile/presentation/profile_screen.dart';
import '../../trips/presentation/create_trip_screen.dart';
import '../../trips/presentation/trip_list_screen.dart';

/// 하단 탭바 셸(design.md §5.1/§6): 좌측 홈/스케줄, 중앙 raised FAB(여행 추가),
/// 우측 기록/마이. 스케줄·기록은 아직 기능이 없어(Phase 7~9, 11~12) 자리표시자만
/// 넣는다.
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _tabIndex = 0;

  static const _tabs = [
    TripListScreen(),
    _ComingSoonTab(label: '스케줄'),
    _ComingSoonTab(label: '기록'),
    ProfileScreen(),
  ];

  void _openCreateTrip() {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CreateTripScreen()));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _tabIndex, children: _tabs),
      floatingActionButton: SizedBox(
        width: 52,
        height: 52,
        child: FloatingActionButton(
          onPressed: _openCreateTrip,
          backgroundColor: AppColors.ink900,
          elevation: 0,
          shape: const CircleBorder(),
          child: const Icon(Icons.add, color: AppColors.lime, size: 26),
        ),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      bottomNavigationBar: ClipRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Container(
            decoration: const BoxDecoration(
              color: Color(0xF5FFFFFF),
              border: Border(top: BorderSide(color: Color(0xFFEFF1F3), width: 1)),
            ),
            child: BottomAppBar(
              shape: const CircularNotchedRectangle(),
              notchMargin: 8,
              color: Colors.transparent,
              elevation: 0,
              height: 88,
              padding: EdgeInsets.zero,
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
                  const SizedBox(width: 44),
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
    final color = selected ? AppColors.ink900 : AppColors.ink300;
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

class _ComingSoonTab extends StatelessWidget {
  const _ComingSoonTab({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Text(
          '$label은(는) 곧 만나요 👋',
          style: const TextStyle(fontSize: 15, color: AppColors.ink400, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}
