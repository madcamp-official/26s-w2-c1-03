import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/config/app_config.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_back_button.dart';
import '../../../core/widgets/app_button.dart';
import '../data/record_photo_models.dart';
import 'record_upload_screen.dart' show recordsApiProvider;

sealed class _SelectionState {
  const _SelectionState();
}

class _SelectionLoading extends _SelectionState {
  const _SelectionLoading();
}

class _SelectionFailed extends _SelectionState {
  const _SelectionFailed(this.message);
  final String message;
}

class _SelectionLoaded extends _SelectionState {
  const _SelectionLoaded(this.items);
  final List<PhotoCandidatePreview> items;
}

/// AI가 추천한 사진(§4 GET .../photos/candidates) 중 최종적으로 기록에 남길
/// 사진을 사용자가 고르는 화면 — 선택/해제 + 캡션 입력 후 finalize.
class RecordSelectionScreen extends ConsumerStatefulWidget {
  const RecordSelectionScreen({super.key, required this.tripId, required this.recordId});

  final String tripId;
  final String recordId;

  @override
  ConsumerState<RecordSelectionScreen> createState() => _RecordSelectionScreenState();
}

class _RecordSelectionScreenState extends ConsumerState<RecordSelectionScreen> {
  _SelectionState _state = const _SelectionLoading();
  final Set<String> _selectedRefIds = {};
  final Map<String, String> _captions = {};
  bool _finalizing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() => _state = const _SelectionLoading());
    try {
      final items = await ref.read(recordsApiProvider).getCandidates(widget.tripId, widget.recordId);
      if (!mounted) return;
      setState(() {
        _state = _SelectionLoaded(items);
        _selectedRefIds
          ..clear()
          ..addAll(items.map((e) => e.photoRefId));
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _state = const _SelectionFailed('추천 사진을 불러오지 못했어요.'));
    }
  }

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
    final state = _state;
    if (state is! _SelectionLoaded || _selectedRefIds.isEmpty) return;

    setState(() => _finalizing = true);
    try {
      final selections = [
        for (var i = 0; i < state.items.length; i++)
          if (_selectedRefIds.contains(state.items[i].photoRefId))
            FinalizeSelection(
              photoRefId: state.items[i].photoRefId,
              caption: _captions[state.items[i].photoRefId],
              orderIndex: i,
            ),
      ];
      await ref.read(recordsApiProvider).finalizeSelection(widget.tripId, widget.recordId, selections);
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
        leading: const AppBackButton(),
        title: const Text('사진 선택', style: TextStyle(color: AppColors.ink900, fontWeight: FontWeight.w800)),
        iconTheme: const IconThemeData(color: AppColors.ink900),
      ),
      body: SafeArea(child: _buildBody()),
    );
  }

  Widget _buildBody() {
    final state = _state;
    return switch (state) {
      _SelectionLoading() => const Center(child: CircularProgressIndicator(color: AppColors.ink900)),
      _SelectionFailed(:final message) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              TextButton(onPressed: _load, child: const Text('다시 시도')),
            ],
          ),
        ),
      ),
      _SelectionLoaded(:final items) => items.isEmpty
          ? const Center(
              child: Text(
                'AI가 추천할 만한 사진을 찾지 못했어요.',
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
                      '${_selectedRefIds.length} / ${items.length}장 선택됨 — 눌러서 선택, 아이콘으로 캡션 추가',
                      style: const TextStyle(fontSize: 12, color: AppColors.ink400, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
                Expanded(
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: items.length,
                    separatorBuilder: (context, index) => const SizedBox(height: 24),
                    itemBuilder: (context, index) {
                      final item = items[index];
                      return _SelectionTile(
                        item: item,
                        selected: _selectedRefIds.contains(item.photoRefId),
                        caption: _captions[item.photoRefId],
                        onTap: () => setState(() {
                          if (!_selectedRefIds.remove(item.photoRefId)) {
                            _selectedRefIds.add(item.photoRefId);
                          }
                        }),
                        onCaptionTap: () => _editCaption(item.photoRefId),
                      );
                    },
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: AppButton(
                    label: '${_selectedRefIds.length}장으로 기록 저장',
                    variant: AppButtonVariant.lime,
                    aiSparkle: true,
                    loading: _finalizing,
                    onPressed: _selectedRefIds.isEmpty ? null : _finalize,
                  ),
                ),
              ],
            ),
    };
  }
}

/// 인스타그램 피드처럼 사진 한 장을 크게 보여주고 그 아래 캡션을 바로
/// 노출한다 — 사진 탭은 선택/해제, 캡션 영역 탭은 그 사진만의 캡션 입력/수정
/// 으로 서로 다른 액션이라 영역을 분리했다(record_detail_screen의
/// _PhotoWithCaptionTile과 같은 패턴).
class _SelectionTile extends StatelessWidget {
  const _SelectionTile({
    required this.item,
    required this.selected,
    required this.caption,
    required this.onTap,
    required this.onCaptionTap,
  });

  final PhotoCandidatePreview item;
  final bool selected;
  final String? caption;
  final VoidCallback onTap;
  final VoidCallback onCaptionTap;

  @override
  Widget build(BuildContext context) {
    final hasCaption = caption != null && caption!.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: onTap,
          child: AspectRatio(
            aspectRatio: 4 / 3,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Container(color: AppColors.surfaceSubtle),
                  Image.network(
                    '${AppConfig.apiBaseUrl}${item.previewUrl}',
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) => const SizedBox.shrink(),
                  ),
                  if (!selected) Container(color: const Color(0x99FFFFFF)),
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Icon(
                      selected ? Icons.check_circle : Icons.radio_button_unchecked,
                      color: selected ? AppColors.lime : Colors.white,
                      size: 24,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        GestureDetector(
          onTap: onCaptionTap,
          behavior: HitTestBehavior.opaque,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                hasCaption ? Icons.edit_note : Icons.add_comment_outlined,
                size: 16,
                color: AppColors.ink400,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  hasCaption ? caption! : '캡션을 남겨보세요',
                  style: TextStyle(
                    fontSize: 13.5,
                    height: 1.4,
                    fontWeight: FontWeight.w500,
                    color: hasCaption ? AppColors.ink600 : AppColors.ink400,
                    fontStyle: hasCaption ? FontStyle.normal : FontStyle.italic,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
