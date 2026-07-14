/// 여행 날짜 범위 표시 형식을 앱 전체에서 통일한다: "2026.07.14 - 07.18"처럼
/// 같은 해면 종료일의 연도를 생략하고, 해가 걸치면("2026.12.30 - 2027.01.02")
/// 종료일에도 연도를 붙인다. 시작일=종료일(당일치기)이면 한 번만 표시한다.
/// [startDate]/[endDate]는 백엔드가 내려주는 "yyyy-MM-dd" 문자열(Trip.startDate
/// 등)을 그대로 받는다.
String formatTripDateRange(String startDate, String endDate) {
  final start = DateTime.parse(startDate);
  final end = DateTime.parse(endDate);

  final startLabel = _formatFull(start);
  final isSameDay = start.year == end.year && start.month == end.month && start.day == end.day;
  if (isSameDay) {
    return startLabel;
  }

  final endLabel = start.year == end.year ? _formatShort(end) : _formatFull(end);
  return '$startLabel - $endLabel';
}

String _formatFull(DateTime date) => '${date.year}.${_pad(date.month)}.${_pad(date.day)}';

String _formatShort(DateTime date) => '${_pad(date.month)}.${_pad(date.day)}';

String _pad(int value) => value.toString().padLeft(2, '0');
