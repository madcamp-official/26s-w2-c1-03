import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/data/area_codes.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import 'city_search_sheet.dart';
import 'trip_detail_screen.dart';
import 'trip_list_controller.dart';

/// 여행 생성 화면(design.md 시안 `3b` 레이아웃 차용). 도시는 자유 텍스트가 아니라
/// `core/data/area_codes.dart`의 국내 시/군/구 234개 중 검색해서 고른다 —
/// TourAPI `areaCode`/`sigunguCode`에 곧바로 매핑되어야 Phase 7 장소 후보 API가
/// 동작하기 때문이다(§places §AREA_CODE_REQUIRED). CTA는 AI 액션이 아니라
/// "확정" 액션이라 lime이 아니라 ink 버튼을 쓴다(§2.4).
class CreateTripScreen extends ConsumerStatefulWidget {
  const CreateTripScreen({super.key, this.initialCity});

  /// 여행지 추천 상세 화면의 "여행 생성" 버튼처럼 도시가 이미 정해진 진입점에서
  /// 도시 검색 단계를 건너뛰도록 미리 채워준다(사용자가 원하면 그대로 다시 바꿀 수 있음).
  final SigunguEntry? initialCity;

  @override
  ConsumerState<CreateTripScreen> createState() => _CreateTripScreenState();
}

class _CreateTripScreenState extends ConsumerState<CreateTripScreen> {
  final _titleController = TextEditingController();
  DateTimeRange? _dateRange;
  SigunguEntry? _selectedCity;
  String? _errorText;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _selectedCity = widget.initialCity;
  }

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  Future<void> _pickCity() async {
    final picked = await showCitySearchSheet(context);
    if (picked != null) {
      setState(() => _selectedCity = picked);
    }
  }

  Future<void> _pickDateRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 2),
      initialDateRange: _dateRange,
      builder: _keyboardSafeDatePickerBuilder,
    );
    if (picked != null) {
      setState(() => _dateRange = picked);
    }
  }

  Future<void> _submit() async {
    final title = _titleController.text.trim();
    final city = _selectedCity;

    if (title.isEmpty || city == null) {
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
            cityName: city.label,
            areaCode: city.areaCode,
            sigunguCode: city.sigunguCode,
            startDate: _formatDate(_dateRange!.start),
            endDate: _formatDate(_dateRange!.end),
          );
      // 홈 탭으로 돌아갔을 때 방금 만든 여행이 바로 보이도록 목록도 갱신해둔다.
      unawaited(ref.read(tripListControllerProvider.notifier).load());

      if (!mounted) return;
      // 여행 상세 화면으로 보낸다 — 그 화면이 스케줄이 비어 있으면 자동으로 장소
      // 선택 화면을 띄우고, 선택을 마치면 (홈이 아니라) 다시 여기로 돌아온다.
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => TripDetailScreen(tripId: trip.id)),
      );
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

  Widget _keyboardSafeDatePickerBuilder(BuildContext context, Widget? child) {
    return MediaQuery.removeViewInsets(
      context: context,
      removeBottom: true,
      child: child ?? const SizedBox.shrink(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: EdgeInsets.fromLTRB(
                22,
                12,
                22,
                22 + MediaQuery.viewInsetsOf(context).bottom,
              ),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: constraints.maxHeight - 34,
                ),
                child: IntrinsicHeight(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _CloseButton(onTap: () => Navigator.of(context).pop()),
                      const SizedBox(height: 20),
                      const Text(
                        '어디로 떠날 거야?',
                        style: TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                          color: AppColors.ink900,
                        ),
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
                      InkWell(
                        onTap: _pickCity,
                        borderRadius: BorderRadius.circular(16),
                        child: _FieldContainer(
                          icon: Icons.search,
                          child: Text(
                            _selectedCity?.label ?? '도시 검색 · 예) 강릉, 해운대구',
                            style: TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w600,
                              color: _selectedCity == null
                                  ? AppColors.ink400
                                  : AppColors.ink900,
                            ),
                          ),
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
                              color: _dateRange == null
                                  ? AppColors.ink400
                                  : AppColors.ink900,
                            ),
                          ),
                        ),
                      ),
                      const Spacer(),
                      AppButton(
                        label: '만들기',
                        onPressed: _submit,
                        loading: _submitting,
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
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
      hintStyle: const TextStyle(
        color: AppColors.ink400,
        fontWeight: FontWeight.w600,
      ),
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
        decoration: const BoxDecoration(
          color: AppColors.surfaceSubtle,
          shape: BoxShape.circle,
        ),
        child: const Icon(Icons.close, size: 20, color: AppColors.ink900),
      ),
    );
  }
}
