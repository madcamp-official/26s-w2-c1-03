import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../data/photo_candidate.dart';
import '../data/record_photo_models.dart';
import 'record_upload_screen.dart' show recordsApiProvider;
import 'widgets/local_asset_thumbnail.dart';

/// 사용자 직접 선택 모드(§ "AI 추천 vs 직접 선택" 두 갈래 중 후자)의 캡션+최종
/// 저장 화면. RecordSelectionScreen과 UX는 같지만(선택/해제, 캡션 입력, 저장),
/// curate/candidates를 거치지 않았으므로 서버에 다시 물어보지 않고 업로드
/// 직전에 이미 들고 있던 로컬 [PhotoCandidate](사진첩 썸네일)를 그대로 쓴다.
class RecordManualCaptionScreen extends ConsumerStatefulWidget {
  const RecordManualCaptionScreen({
    super.key,
    required this.tripId,
    required this.recordId,
    required this.candidatesByRefId,
  });

  final String tripId;
  final String recordId;
  final Map<String, PhotoCandidate> candidatesByRefId;

  @override
  ConsumerState<RecordManualCaptionScreen> createState() => _RecordManualCaptionScreenState();
}

class _RecordManualCaptionScreenState extends ConsumerState<RecordManualCaptionScreen> {
  late final List<String> _refIds = widget.candidatesByRefId.keys.toList();
  late final Set<String> _selectedRefIds = _refIds.toSet();
  final Map<String, String> _captions = {};
  bool _finalizing = false;

  Future<void> _editCaption(String photoRefId) async {
    final controller = TextEditingController(text: _captions[photoRefId] ?? '');
    final saved = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('캡션'),
        content: TextField(
          controller: controller,
          maxLength: 200,
          maxLines: 3,
          decoration: const InputDecoration(hintText: '이 사진에 대한 한마디'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(), child: const Text('취소')),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(controller.text.trim()),
            child: const Text('저장'),
          ),
        ],
      ),
    );
    if (saved != null && mounted) {
      setState(() => _captions[photoRefId] = saved);
    }
  }

  Future<void> _finalize() async {
    if (_selectedRefIds.isEmpty) return;

    setState(() => _finalizing = true);
    try {
      final selections = [
        for (var i = 0; i < _refIds.length; i++)
          if (_selectedRefIds.contains(_refIds[i]))
            FinalizeSelection(photoRefId: _refIds[i], caption: _captions[_refIds[i]], orderIndex: i),
      ];
      await ref
          .read(recordsApiProvider)
          .finalizeSelection(widget.tripId, widget.recordId, selections);
      if (!mounted) return;

      // 이 화면만 닫는다 — 위(업로드 진행 화면 등)는 각자 push+pop 체인으로
      // 이 결과(true)를 이어받아 스스로 정리하고 원래 호출한 화면으로 돌아간다.
      Navigator.of(context).pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _finalizing = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('저장하지 못했어요. 다시 시도해주세요.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('캡션 달기', style: TextStyle(color: AppColors.ink900, fontWeight: FontWeight.w800)),
        iconTheme: const IconThemeData(color: AppColors.ink900),
      ),
      body: SafeArea(
        child: _refIds.isEmpty
            ? const Center(
                child: Text(
                  '업로드된 사진이 없어요',
                  style: TextStyle(color: AppColors.ink400, fontWeight: FontWeight.w600),
                ),
              )
            : Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        '${_selectedRefIds.length} / ${_refIds.length}장 선택됨 — 눌러서 선택, 아이콘으로 캡션 추가',
                        style: const TextStyle(fontSize: 12, color: AppColors.ink400, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                  Expanded(
                    child: GridView.builder(
                      padding: const EdgeInsets.all(16),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        crossAxisSpacing: 8,
                        mainAxisSpacing: 8,
                      ),
                      itemCount: _refIds.length,
                      itemBuilder: (context, index) {
                        final refId = _refIds[index];
                        final candidate = widget.candidatesByRefId[refId]!;
                        return _ManualTile(
                          candidate: candidate,
                          selected: _selectedRefIds.contains(refId),
                          hasCaption: _captions[refId]?.isNotEmpty ?? false,
                          onTap: () => setState(() {
                            if (!_selectedRefIds.remove(refId)) {
                              _selectedRefIds.add(refId);
                            }
                          }),
                          onCaptionTap: () => _editCaption(refId),
                        );
                      },
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: AppButton(
                      label: '${_selectedRefIds.length}장으로 기록 저장',
                      variant: AppButtonVariant.lime,
                      loading: _finalizing,
                      onPressed: _selectedRefIds.isEmpty ? null : _finalize,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _ManualTile extends StatelessWidget {
  const _ManualTile({
    required this.candidate,
    required this.selected,
    required this.hasCaption,
    required this.onTap,
    required this.onCaptionTap,
  });

  final PhotoCandidate candidate;
  final bool selected;
  final bool hasCaption;
  final VoidCallback onTap;
  final VoidCallback onCaptionTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Stack(
          fit: StackFit.expand,
          children: [
            LocalAssetThumbnail(asset: candidate.asset),
            if (!selected) Container(color: const Color(0x99FFFFFF)),
            Positioned(
              top: 4,
              right: 4,
              child: Icon(
                selected ? Icons.check_circle : Icons.radio_button_unchecked,
                color: selected ? AppColors.lime : Colors.white,
                size: 20,
              ),
            ),
            Positioned(
              bottom: 4,
              left: 4,
              child: GestureDetector(
                onTap: onCaptionTap,
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: const BoxDecoration(color: Color(0x99000000), shape: BoxShape.circle),
                  child: Icon(
                    hasCaption ? Icons.edit_note : Icons.add_comment_outlined,
                    color: Colors.white,
                    size: 14,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
