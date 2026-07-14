import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../data/trip_members_api.dart';
import 'trip_detail_screen.dart';
import 'trip_list_controller.dart';

/// 초대 딥링크(`tripandend://join?token=...`)로 진입하는 가입 화면. 진입 즉시
/// join API를 호출하고, 성공하면 해당 여행 상세로 교체 이동한다(이미 멤버여도
/// 서버가 멱등 처리하므로 같은 흐름). 만료(410)/무효(404) 토큰은 에러 안내만 남긴다.
class JoinTripScreen extends ConsumerStatefulWidget {
  const JoinTripScreen({super.key, required this.token});

  final String token;

  @override
  ConsumerState<JoinTripScreen> createState() => _JoinTripScreenState();
}

class _JoinTripScreenState extends ConsumerState<JoinTripScreen> {
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _join();
  }

  Future<void> _join() async {
    setState(() => _errorMessage = null);
    try {
      final tripId = await ref.read(tripMembersApiProvider).joinByToken(widget.token);
      unawaited(ref.read(tripListControllerProvider.notifier).load());
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => TripDetailScreen(tripId: tripId)),
      );
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(
        () => _errorMessage = error is ApiException
            ? error.message
            : '네트워크 연결을 확인해주세요.',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final errorMessage = _errorMessage;
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: errorMessage == null
                ? const Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(color: AppColors.ink900),
                      SizedBox(height: 16),
                      Text(
                        '여행에 참여하는 중...',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink900,
                        ),
                      ),
                    ],
                  )
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.link_off, size: 40, color: AppColors.ink400),
                      const SizedBox(height: 12),
                      Text(
                        errorMessage,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w600,
                          color: AppColors.ink900,
                        ),
                      ),
                      const SizedBox(height: 20),
                      AppButton(
                        label: '다시 시도',
                        variant: AppButtonVariant.outline,
                        height: 48,
                        onPressed: _join,
                      ),
                      const SizedBox(height: 10),
                      AppButton(
                        label: '닫기',
                        height: 48,
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
