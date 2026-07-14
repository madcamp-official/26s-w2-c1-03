import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:photo_manager/photo_manager.dart';
import '../../../core/theme/app_colors.dart';
import '../data/photo_candidate.dart';
import '../data/photo_filter_pipeline.dart';

/// 1단계 필터링 결과 확인 화면. 백엔드 Phase 11 API(메타데이터 등록/업로드/curate)가
/// 아직 없어서, 이 화면이 현재 파이프라인의 종착점이다 — 다음 커밋에서 백엔드 연동이
/// 붙으면 여기서 "다음" 버튼으로 업로드 단계로 넘어가게 된다.
class RecordCandidatesScreen extends StatelessWidget {
  const RecordCandidatesScreen({super.key, required this.result});

  final PhotoFilterResult result;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Text(
          '후보 ${result.candidates.length}장',
          style: const TextStyle(color: AppColors.ink900, fontWeight: FontWeight.w800),
        ),
        iconTheme: const IconThemeData(color: AppColors.ink900),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.surfaceSubtle,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                '전체 ${result.totalScanned}장 중 1차 필터를 통과한 사진이에요. AI 추천·업로드 연동은 다음 단계에서 이어집니다.',
                style: const TextStyle(fontSize: 12.5, color: AppColors.ink600, fontWeight: FontWeight.w600),
              ),
            ),
            Expanded(
              child: result.candidates.isEmpty
                  ? const Center(
                      child: Text(
                        '이 기간에 찾은 사진이 없어요.',
                        style: TextStyle(color: AppColors.ink400, fontWeight: FontWeight.w600),
                      ),
                    )
                  : GridView.builder(
                      padding: const EdgeInsets.all(16),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        crossAxisSpacing: 8,
                        mainAxisSpacing: 8,
                      ),
                      itemCount: result.candidates.length,
                      itemBuilder: (context, index) => _CandidateTile(candidate: result.candidates[index]),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CandidateTile extends StatelessWidget {
  const _CandidateTile({required this.candidate});

  final PhotoCandidate candidate;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: FutureBuilder<Uint8List?>(
        future: candidate.asset.thumbnailDataWithSize(const ThumbnailSize(300, 300)),
        builder: (context, snapshot) {
          final bytes = snapshot.data;
          return Stack(
            fit: StackFit.expand,
            children: [
              Container(color: AppColors.surfaceSubtle),
              if (bytes != null) Image.memory(bytes, fit: BoxFit.cover),
              if (candidate.locationName != null)
                Positioned(
                  left: 4,
                  right: 4,
                  bottom: 4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0x99000000),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      candidate.locationName!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
