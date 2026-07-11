import 'package:flutter/material.dart';
import '../../../core/data/area_codes.dart';
import '../../../core/theme/app_colors.dart';

/// 시/군/구 234개(§core/data/area_codes.dart) 중 검색해서 하나를 고르는 바텀시트.
/// design.md 시안 `3b`의 "도시 검색" 입력을 대체한다 — 자유 텍스트 대신 TourAPI
/// 지역코드에 곧바로 매핑되는 고정 목록에서 고르게 해서, 매칭 실패(오타, "부산" vs
/// "부산광역시" 같은 표기 차이) 문제 자체가 생기지 않게 한다. 국내 여행 전용
/// 결정(plan.md §16)에 맞춰 목록도 국내 234개뿐이다.
Future<SigunguEntry?> showCitySearchSheet(BuildContext context) {
  return showModalBottomSheet<SigunguEntry>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (context) => const _CitySearchSheet(),
  );
}

class _CitySearchSheet extends StatefulWidget {
  const _CitySearchSheet();

  @override
  State<_CitySearchSheet> createState() => _CitySearchSheetState();
}

class _CitySearchSheetState extends State<_CitySearchSheet> {
  final _controller = TextEditingController();
  List<SigunguEntry> _results = koreaSigunguList;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String query) {
    final trimmed = query.trim();
    setState(() {
      _results = trimmed.isEmpty
          ? koreaSigunguList
          : koreaSigunguList.where((e) => e.label.contains(trimmed)).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.75,
        child: Column(
          children: [
            const SizedBox(height: 12),
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: TextField(
                controller: _controller,
                autofocus: true,
                onChanged: _onChanged,
                decoration: InputDecoration(
                  hintText: '시/군/구 검색 · 예) 강릉, 해운대구',
                  hintStyle: const TextStyle(color: AppColors.ink400, fontWeight: FontWeight.w600),
                  prefixIcon: const Icon(Icons.search, color: AppColors.ink400, size: 20),
                  filled: true,
                  fillColor: AppColors.surfaceSubtle,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            Expanded(
              child: _results.isEmpty
                  ? const Center(
                      child: Text(
                        '검색 결과가 없어',
                        style: TextStyle(color: AppColors.ink400, fontWeight: FontWeight.w600),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      itemCount: _results.length,
                      itemBuilder: (context, index) {
                        final entry = _results[index];
                        return InkWell(
                          onTap: () => Navigator.of(context).pop(entry),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 13),
                            decoration: const BoxDecoration(
                              border: Border(bottom: BorderSide(color: AppColors.border, width: 1)),
                            ),
                            child: Row(
                              children: [
                                Text(
                                  entry.sigunguName,
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.ink900,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  entry.areaName,
                                  style: const TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.ink400,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
