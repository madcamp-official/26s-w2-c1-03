import 'package:photo_manager/photo_manager.dart';

enum PhotoAccessResult { granted, limited, denied }

/// 사진첩 접근(§8.1). 권한 요청과 기간 제한 조회 둘 다, 호출하는 화면이 사용자
/// 액션(예: "기록 시작" 버튼)에서 명시적으로만 불러야 한다 — initState 등에서
/// 자동 호출 금지(수용기준 §3.1-2: "알림 클릭 또는 기록 시작 선택 시점에만 조회").
class PhotoLibraryService {
  Future<PhotoAccessResult> requestAccess() async {
    final state = await PhotoManager.requestPermissionExtend();
    if (state.isAuth) return PhotoAccessResult.granted;
    if (state == PermissionState.limited) return PhotoAccessResult.limited;
    return PhotoAccessResult.denied;
  }

  /// [start]~[end] 범위로 쿼리를 제한한다(§8.1 "쿼리 자체를 여행 시작일~종료일
  /// 범위로 제한"). end는 그날 23:59:59까지 포함하도록 하루를 더한다.
  Future<List<AssetEntity>> queryByDateRange({
    required DateTime start,
    required DateTime end,
  }) async {
    final inclusiveEnd = DateTime(end.year, end.month, end.day + 1);
    final filter = FilterOptionGroup(
      imageOption: const FilterOption(sizeConstraint: SizeConstraint(ignoreSize: true)),
      createTimeCond: DateTimeCond(min: start, max: inclusiveEnd),
      orders: [const OrderOption(type: OrderOptionType.createDate, asc: false)],
    );

    final paths = await PhotoManager.getAssetPathList(
      type: RequestType.image,
      filterOption: filter,
    );
    if (paths.isEmpty) return [];

    // 여러 앨범(스크린샷/다운로드 등)에 나뉘어 있어도 기간 필터가 이미 적용된
    // 상태이므로, 기기 전체를 포괄하는 첫 번째 경로(보통 "Recent"/전체 사진)만
    // 쓰면 기간 내 전체 사진을 커버한다.
    final recent = paths.first;
    final count = await recent.assetCountAsync;
    return recent.getAssetListRange(start: 0, end: count);
  }
}
