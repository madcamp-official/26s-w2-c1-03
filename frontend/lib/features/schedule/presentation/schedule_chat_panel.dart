import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../data/schedule_api.dart';
import '../data/schedule_models.dart';

/// 편집 화면 우측 하단 FAB로 열고 닫는 채팅 패널(화면의 절반 높이) — place_selection_screen의
/// PlaceSheet처럼 현재 화면 위에 겹쳐서 뜬다. AI가 도구(장소 검색/추가/삭제/이동)를 호출하면
/// 서버가 즉시 반영하므로, 답장이 오는 즉시 [onScheduleChanged]로 호스트 화면에 최신 일정을
/// 알려 실시간으로 반영되게 한다. 되돌리기는 그 턴 시작 전 스냅샷으로 되돌리는 방식이다.
class ScheduleChatPanel extends ConsumerStatefulWidget {
  const ScheduleChatPanel({
    super.key,
    required this.tripId,
    required this.onScheduleChanged,
    required this.onClose,
  });

  final String tripId;
  final ValueChanged<SchedulePlan> onScheduleChanged;
  final VoidCallback onClose;

  @override
  ConsumerState<ScheduleChatPanel> createState() => _ScheduleChatPanelState();
}

/// 화면에 그리는 대화 한 줄. 로컬 오류 안내(_isLocalError)는 API 히스토리에 넣지 않는다
/// — 실제로 오간 적 없는 assistant 턴을 AI에게 사실처럼 되돌려주면 안 되기 때문이다.
class _ChatEntry {
  _ChatEntry.user(String content)
      : message = ChatMessage(role: 'user', content: content),
        snapshotBefore = null,
        changed = false,
        isLocalError = false,
        reverted = false;

  _ChatEntry.assistant(String content, {required this.snapshotBefore, required this.changed})
      : message = ChatMessage(role: 'assistant', content: content),
        isLocalError = false,
        reverted = false;

  _ChatEntry.localError(String content)
      : message = ChatMessage(role: 'assistant', content: content),
        snapshotBefore = null,
        changed = false,
        isLocalError = true,
        reverted = false;

  final ChatMessage message;
  final SchedulePlan? snapshotBefore;
  final bool changed;
  final bool isLocalError;
  bool reverted;
}

class _ScheduleChatPanelState extends ConsumerState<ScheduleChatPanel> {
  final _entries = <_ChatEntry>[];
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();
  SchedulePlan? _currentSchedule;
  bool _loadingInitial = true;
  String? _loadError;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _loadInitialSchedule();
  }

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadInitialSchedule() async {
    try {
      final schedule = await ref.read(scheduleApiProvider).getSchedule(widget.tripId);
      if (!mounted) return;
      setState(() {
        _currentSchedule = schedule;
        _loadingInitial = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      setState(() {
        _loadingInitial = false;
        _loadError = error is ApiException ? error.message : '일정을 불러오지 못했어요.';
      });
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  List<ChatMessage> _buildHistory() =>
      [for (final entry in _entries) if (!entry.isLocalError) entry.message];

  Future<void> _send() async {
    final text = _inputController.text.trim();
    if (text.isEmpty || _sending || _currentSchedule == null) return;
    _inputController.clear();
    FocusScope.of(context).unfocus();

    final snapshotBeforeTurn = _currentSchedule!;
    setState(() {
      _entries.add(_ChatEntry.user(text));
      _sending = true;
    });
    _scrollToBottom();

    try {
      final reply = await ref
          .read(scheduleApiProvider)
          .chat(tripId: widget.tripId, messages: _buildHistory());
      if (!mounted) return;
      setState(() {
        _entries.add(
          _ChatEntry.assistant(
            reply.reply,
            snapshotBefore: snapshotBeforeTurn,
            changed: reply.changed,
          ),
        );
        _currentSchedule = reply.schedule;
      });
      if (reply.changed) widget.onScheduleChanged(reply.schedule);
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      final message = error is ApiException ? error.message : 'AI와 통신하지 못했어요. 다시 시도해줘.';
      setState(() => _entries.add(_ChatEntry.localError(message)));
    } finally {
      if (mounted) setState(() => _sending = false);
      _scrollToBottom();
    }
  }

  /// 가장 최근에 실제로 일정을 바꾼(아직 되돌리지 않은) 턴만 되돌릴 수 있게 한다.
  /// 중간 턴을 되돌리면 그 뒤에 쌓인 변경과 순서가 꼬여 사용자가 혼란스러울 수 있어서다.
  int? get _revertibleIndex {
    for (var i = _entries.length - 1; i >= 0; i--) {
      final entry = _entries[i];
      if (entry.isLocalError) continue;
      if (entry.message.role == 'assistant') {
        return entry.changed && !entry.reverted ? i : null;
      }
    }
    return null;
  }

  Future<void> _revert(int index) async {
    final entry = _entries[index];
    final snapshot = entry.snapshotBefore;
    if (snapshot == null || _sending) return;

    setState(() => _sending = true);
    try {
      final restored = await ref
          .read(scheduleApiProvider)
          .restoreSnapshot(tripId: widget.tripId, snapshot: snapshot);
      if (!mounted) return;
      setState(() {
        entry.reverted = true;
        _currentSchedule = restored;
      });
      widget.onScheduleChanged(restored);
    } on DioException catch (e) {
      if (!mounted) return;
      final error = e.error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error is ApiException ? error.message : '되돌리지 못했어요.')),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final revertibleIndex = _revertibleIndex;
    return Material(
      color: Colors.white,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      elevation: 12,
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        child: SafeArea(
          top: false,
          child: Column(
            children: [
              _buildHeader(),
              const Divider(height: 1),
              Expanded(child: _buildBody(revertibleIndex)),
              if (_sending)
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                ),
              _buildInputBar(),
            ],
          ),
        ),
      ),
    );
  }

  /// 헤더를 아래로 끄는 제스처로도 패널을 닫을 수 있게 한다("채팅을 내리면 화면이
  /// 돌아온다"). 누적 드래그 거리가 임계치를 넘거나 빠르게 아래로 튕기면 닫는다 —
  /// 살짝 스친 정도로는 안 닫혀야 실수로 닫히지 않는다.
  double _dragDy = 0;

  void _onHeaderDragUpdate(DragUpdateDetails details) {
    _dragDy = (_dragDy + details.delta.dy).clamp(0, double.infinity);
  }

  void _onHeaderDragEnd(DragEndDetails details) {
    final flungDown = (details.primaryVelocity ?? 0) > 300;
    if (flungDown || _dragDy > 40) {
      widget.onClose();
    }
    _dragDy = 0;
  }

  Widget _buildHeader() {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onVerticalDragUpdate: _onHeaderDragUpdate,
      onVerticalDragEnd: _onHeaderDragEnd,
      child: Column(
        children: [
          const SizedBox(height: 8),
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.ink200,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 8, 10, 8),
            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(color: AppColors.lime, shape: BoxShape.circle),
                  child: const Icon(Icons.auto_awesome, size: 16, color: AppColors.green800),
                ),
                const SizedBox(width: 10),
                const Text(
                  'AI와 대화',
                  style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: AppColors.ink900),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.keyboard_arrow_down, color: AppColors.ink400),
                  onPressed: widget.onClose,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(int? revertibleIndex) {
    if (_loadingInitial) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_loadError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_loadError!, textAlign: TextAlign.center),
              const SizedBox(height: 10),
              TextButton(onPressed: _loadInitialSchedule, child: const Text('다시 시도')),
            ],
          ),
        ),
      );
    }
    if (_entries.isEmpty) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(18, 4, 18, 18),
        children: const [
          Text(
            '무엇이든 편하게 말해보세요',
            style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: AppColors.ink900),
          ),
          SizedBox(height: 6),
          Text(
            '예: "둘째 날에 바다 보이는 카페 넣어줘", "그 식당 빼줘", "1일차 순서를 바꿔줘"',
            style: TextStyle(fontSize: 13, height: 1.5, fontWeight: FontWeight.w600, color: AppColors.ink600),
          ),
        ],
      );
    }
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
      itemCount: _entries.length,
      itemBuilder: (context, index) => _ChatBubble(
        entry: _entries[index],
        canRevert: index == revertibleIndex,
        reverting: _sending && index == revertibleIndex,
        onRevert: () => _revert(index),
      ),
    );
  }

  Widget _buildInputBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 12),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _inputController,
              enabled: !_sending && _currentSchedule != null,
              minLines: 1,
              maxLines: 3,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _send(),
              decoration: InputDecoration(
                hintText: '메시지를 입력하세요',
                filled: true,
                fillColor: AppColors.surfaceSubtle,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            onPressed: _sending || _currentSchedule == null ? null : _send,
            style: IconButton.styleFrom(
              backgroundColor: AppColors.ink900,
              foregroundColor: Colors.white,
              disabledBackgroundColor: AppColors.ink200,
            ),
            icon: const Icon(Icons.arrow_upward, size: 20),
          ),
        ],
      ),
    );
  }
}

class _ChatBubble extends StatelessWidget {
  const _ChatBubble({
    required this.entry,
    required this.canRevert,
    required this.reverting,
    required this.onRevert,
  });

  final _ChatEntry entry;
  final bool canRevert;
  final bool reverting;
  final VoidCallback onRevert;

  @override
  Widget build(BuildContext context) {
    final isUser = entry.message.role == 'user';
    final bubbleColor = isUser
        ? AppColors.ink900
        : (entry.isLocalError ? AppColors.dangerBg : AppColors.surfaceMuted);
    final textColor = isUser ? Colors.white : AppColors.ink900;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Column(
        crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Container(
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.7),
            padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
            decoration: BoxDecoration(color: bubbleColor, borderRadius: BorderRadius.circular(16)),
            child: Text(
              entry.message.content,
              style: TextStyle(fontSize: 13.5, height: 1.4, fontWeight: FontWeight.w600, color: textColor),
            ),
          ),
          if (entry.reverted) ...[
            const SizedBox(height: 3),
            const Text(
              '되돌렸어요',
              style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.ink400),
            ),
          ] else if (canRevert) ...[
            const SizedBox(height: 3),
            TextButton.icon(
              onPressed: reverting ? null : onRevert,
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                foregroundColor: AppColors.ink400,
              ),
              icon: const Icon(Icons.undo, size: 13),
              label: const Text('되돌리기', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700)),
            ),
          ],
        ],
      ),
    );
  }
}
