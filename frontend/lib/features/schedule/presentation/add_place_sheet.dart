import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../places/data/places_api.dart';
import '../../places/data/places_models.dart';

/// 장소 추가 결과 — 검색 선택(placeId) 또는 직접 입력(customName/customAddress) 중 하나.
class AddPlaceResult {
  AddPlaceResult.fromCandidate(PlaceCandidate candidate)
      : placeId = candidate.id,
        customName = null,
        customAddress = null;

  const AddPlaceResult.custom({required this.customName, this.customAddress})
      : placeId = null;

  final String? placeId;
  final String? customName;
  final String? customAddress;
}

/// "이 날에 장소 추가" 바텀시트. 검색 탭(백엔드 검색 → 선택)과 직접 입력 탭을 제공하고,
/// 선택/입력이 끝나면 [AddPlaceResult]로 pop한다. 실제 추가 API 호출은 호출부가 한다.
class AddPlaceSheet extends ConsumerStatefulWidget {
  const AddPlaceSheet({super.key, required this.tripId, required this.dayNumber});

  final String tripId;
  final int dayNumber;

  @override
  ConsumerState<AddPlaceSheet> createState() => _AddPlaceSheetState();
}

class _AddPlaceSheetState extends ConsumerState<AddPlaceSheet> {
  final _searchController = TextEditingController();
  final _nameController = TextEditingController();
  final _addressController = TextEditingController();

  bool _searching = false;
  List<PlaceCandidate> _results = const [];
  String? _searchError;
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _nameController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    final keyword = value.trim();
    if (keyword.isEmpty) {
      setState(() {
        _results = const [];
        _searchError = null;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 400), () => _search(keyword));
  }

  Future<void> _search(String keyword) async {
    setState(() {
      _searching = true;
      _searchError = null;
    });
    try {
      final results =
          await ref.read(placesApiProvider).searchCandidates(widget.tripId, keyword);
      if (!mounted) return;
      setState(() => _results = results);
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(() => _searchError = error is ApiException ? error.message : '검색에 실패했어요.');
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  void _submitCustom() {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;
    Navigator.of(context).pop(
      AddPlaceResult.custom(
        customName: name,
        customAddress: _addressController.text.trim().isEmpty
            ? null
            : _addressController.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return DefaultTabController(
      length: 2,
      child: Padding(
        padding: EdgeInsets.only(bottom: bottomInset),
        child: DraggableScrollableSheet(
          initialChildSize: 0.75,
          minChildSize: 0.5,
          maxChildSize: 0.95,
          expand: false,
          builder: (context, scrollController) => Column(
            children: [
              const SizedBox(height: 10),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.ink200,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(22, 14, 22, 4),
                child: Row(
                  children: [
                    Text(
                      'Day ${widget.dayNumber}에 장소 추가',
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                        color: AppColors.ink900,
                      ),
                    ),
                  ],
                ),
              ),
              const TabBar(
                labelColor: AppColors.ink900,
                unselectedLabelColor: AppColors.ink400,
                indicatorColor: AppColors.green800,
                tabs: [Tab(text: '검색으로 추가'), Tab(text: '직접 입력')],
              ),
              Expanded(
                child: TabBarView(
                  children: [
                    _buildSearchTab(scrollController),
                    _buildCustomTab(scrollController),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSearchTab(ScrollController scrollController) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(22, 14, 22, 8),
          child: TextField(
            controller: _searchController,
            autofocus: true,
            onChanged: _onSearchChanged,
            decoration: InputDecoration(
              hintText: '장소 이름을 검색해보세요',
              prefixIcon: const Icon(Icons.search, color: AppColors.ink400),
              filled: true,
              fillColor: AppColors.surfaceSubtle,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
            ),
          ),
        ),
        if (_searching) const LinearProgressIndicator(minHeight: 2),
        Expanded(
          child: _searchError != null
              ? Center(child: Text(_searchError!))
              : ListView.separated(
                  controller: scrollController,
                  padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 8),
                  itemCount: _results.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final candidate = _results[index];
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        candidate.name,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink900,
                        ),
                      ),
                      subtitle: candidate.address != null
                          ? Text(candidate.address!, maxLines: 1, overflow: TextOverflow.ellipsis)
                          : null,
                      trailing: const Icon(Icons.add_circle_outline, color: AppColors.green800),
                      onTap: () => Navigator.of(context)
                          .pop(AddPlaceResult.fromCandidate(candidate)),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildCustomTab(ScrollController scrollController) {
    return ListView(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(22, 18, 22, 22),
      children: [
        TextField(
          controller: _nameController,
          decoration: InputDecoration(
            labelText: '장소 이름 *',
            filled: true,
            fillColor: AppColors.surfaceSubtle,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _addressController,
          decoration: InputDecoration(
            labelText: '주소 (선택)',
            filled: true,
            fillColor: AppColors.surfaceSubtle,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
          ),
        ),
        const SizedBox(height: 18),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.ink900,
              padding: const EdgeInsets.symmetric(vertical: 15),
            ),
            onPressed: _submitCustom,
            child: const Text('추가', style: TextStyle(fontWeight: FontWeight.w800)),
          ),
        ),
      ],
    );
  }
}
