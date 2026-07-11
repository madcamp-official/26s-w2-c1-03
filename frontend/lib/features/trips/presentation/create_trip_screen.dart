import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import 'trip_detail_screen.dart';
import 'trip_list_controller.dart';

/// 여행 생성 화면. `areaCode`/`sigunguCode`는 이번 스코프에서 받지 않는다 —
/// 도시는 자유 텍스트로만 받고, 지역코드 매핑은 Phase 7(장소 추천)에서 추가한다.
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
      setState(() => _errorText = '제목과 도시를 모두 입력해주세요.');
      return;
    }
    if (_dateRange == null) {
      setState(() => _errorText = '여행 기간을 선택해주세요.');
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
        _errorText = error is ApiException ? error.message : '네트워크 연결을 확인해주세요.';
      });
    }
  }

  String _formatDate(DateTime date) {
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    return '${date.year}-$month-$day';
  }

  InputDecoration _inputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      filled: true,
      fillColor: const Color(0xFFF2F4F6),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          '새 여행',
          style: TextStyle(color: Color(0xFF191F28), fontWeight: FontWeight.w700),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '어디로 떠날 거야?',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Color(0xFF191F28)),
              ),
              const SizedBox(height: 20),
              if (_errorText != null) ...[
                _ErrorBanner(message: _errorText!),
                const SizedBox(height: 16),
              ],
              TextField(
                controller: _titleController,
                decoration: _inputDecoration('여행 제목 (예: 제주 3박4일)'),
              ),
              const SizedBox(height: 12),
              TextField(controller: _cityController, decoration: _inputDecoration('도시 (예: 제주)')),
              const SizedBox(height: 12),
              InkWell(
                onTap: _pickDateRange,
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF2F4F6),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Text(
                    _dateRange == null
                        ? '여행 기간 선택'
                        : '${_formatDate(_dateRange!.start)} ~ ${_formatDate(_dateRange!.end)}',
                    style: TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                      color: _dateRange == null
                          ? const Color(0xFF8B95A1)
                          : const Color(0xFF191F28),
                    ),
                  ),
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF191F28),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: _submitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('만들기', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF1F1),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Color(0xFFD14343), fontSize: 13.5, fontWeight: FontWeight.w600),
      ),
    );
  }
}
