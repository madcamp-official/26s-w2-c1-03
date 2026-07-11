import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import 'trip_detail_screen.dart';
import 'trip_list_controller.dart';

/// 여행 생성 화면(design.md 시안 `3b` 레이아웃 차용). `areaCode`/`sigunguCode`는
/// 이번 스코프에서 받지 않는다 — 도시는 자유 텍스트로만 받고, 지역코드 매핑과
/// AI 장소 추천(시안 `4b`)은 Phase 7에서 추가한다. 그래서 CTA는 AI 액션이 아니라
/// "확정" 액션이라 lime이 아니라 ink 버튼을 쓴다(§2.4).
class CreateTripScreen extends ConsumerStatefulWidget {
  const CreateTripScreen({super.key});

  @override
  ConsumerState<CreateTripScreen> createState() => _CreateTripScreenState();
}

class _CreateTripScreenState extends ConsumerState<CreateTripScreen> {
  final _titleController = TextEditingController();
  final _cityController = TextEditingController();
  DateTimeRange? _dateRange;
  String? _errorText;
  bool _submitting = false;

  @override
  void dispose() {
    _titleController.dispose();
    _cityController.dispose();
    super.dispose();
  }

  Future<void> _pickDateRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 2),
      initialDateRange: _dateRange,
    );
    if (picked != null) {
      setState(() => _dateRange = picked);
    }
  }

  Future<void> _submit() async {
    final title = _titleController.text.trim();
    final city = _cityController.text.trim();

    if (title.isEmpty || city.isEmpty) {
      setState(() => _errorText = '제목과 도시를 모두 입력해줘');
      return;
    }
    if (_dateRange == null) {
      setState(() => _errorText = '여행 기간을 선택해줘');
      return;
    }

    setState(() {
      _errorText = null;
      _submitting = true;
    });

    try {
      final trip = await ref
          .read(tripsApiProvider)
          .create(
            title: title,
            cityName: city,
            startDate: _formatDate(_dateRange!.start),
            endDate: _formatDate(_dateRange!.end),
          );
      // 홈 탭으로 돌아갔을 때 방금 만든 여행이 바로 보이도록 목록도 갱신해둔다.
      unawaited(ref.read(tripListControllerProvider.notifier).load());

      if (!mounted) return;
      Navigator.of(
        context,
      ).pushReplacement(MaterialPageRoute(builder: (_) => TripDetailScreen(tripId: trip.id)));
    } on DioException catch (e) {
      final error = e.error;
      setState(() {
        _submitting = false;
        _errorText = error is ApiException ? error.message : '네트워크 연결을 확인해줘';
      });
    }
  }

  String _formatDate(DateTime date) {
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    return '${date.year}-$month-$day';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 12, 22, 22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _CloseButton(onTap: () => Navigator.of(context).pop()),
              const SizedBox(height: 20),
              const Text(
                '어디로 떠날 거야?',
                style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppColors.ink900),
              ),
              const SizedBox(height: 8),
              const Text(
                '제목이랑 도시, 날짜만 알려주면\n여행을 만들어줄게',
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.ink400,
                  fontWeight: FontWeight.w600,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 24),
              if (_errorText != null) ...[
                AppErrorBanner(message: _errorText!),
                const SizedBox(height: 16),
              ],
              _FieldContainer(
                icon: Icons.edit_outlined,
                child: TextField(
                  controller: _titleController,
                  style: _fieldTextStyle,
                  decoration: _fieldDecoration('여행 제목 · 예) 제주 3박4일'),
                ),
              ),
              const SizedBox(height: 12),
              _FieldContainer(
                icon: Icons.search,
                child: TextField(
                  controller: _cityController,
                  style: _fieldTextStyle,
                  decoration: _fieldDecoration('도시 검색 · 예) 오사카, 다낭'),
                ),
              ),
              const SizedBox(height: 12),
              InkWell(
                onTap: _pickDateRange,
                borderRadius: BorderRadius.circular(16),
                child: _FieldContainer(
                  icon: Icons.calendar_today_outlined,
                  child: Text(
                    _dateRange == null
                        ? '날짜 선택'
                        : '${_formatDate(_dateRange!.start)} ~ ${_formatDate(_dateRange!.end)}',
                    style: TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                      color: _dateRange == null ? AppColors.ink400 : AppColors.ink900,
                    ),
                  ),
                ),
              ),
              const Spacer(),
              AppButton(label: '만들기', onPressed: _submit, loading: _submitting),
            ],
          ),
        ),
      ),
    );
  }

  static const _fieldTextStyle = TextStyle(
    fontSize: 14.5,
    fontWeight: FontWeight.w600,
    color: AppColors.ink900,
  );

  InputDecoration _fieldDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: AppColors.ink400, fontWeight: FontWeight.w600),
      border: InputBorder.none,
      isDense: true,
      contentPadding: EdgeInsets.zero,
    );
  }
}

class _FieldContainer extends StatelessWidget {
  const _FieldContainer({required this.icon, required this.child});

  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
      decoration: BoxDecoration(
        color: AppColors.surfaceSubtle,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.ink400),
          const SizedBox(width: 10),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class _CloseButton extends StatelessWidget {
  const _CloseButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 36,
        height: 36,
        decoration: const BoxDecoration(color: AppColors.surfaceSubtle, shape: BoxShape.circle),
        child: const Icon(Icons.close, size: 20, color: AppColors.ink900),
      ),
    );
  }
}
