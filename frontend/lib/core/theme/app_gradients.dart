import 'package:flutter/material.dart';

/// design.md §2.5 썸네일 플레이스홀더 그라디언트. 실제 사진이 없는 자리(여행지 대표
/// 이미지 등)에 문자열(예: 여행 id)을 해시해서 결정적으로 하나를 배정한다.
abstract final class AppGradients {
  static const List<List<Color>> palette = [
    [Color(0xFF5B4778), Color(0xFFDEBDFC)],
    [Color(0xFF21746D), Color(0xFFBFFFFA)],
    [Color(0xFF8A7A24), Color(0xFFFAFCBD)],
    [Color(0xFF211A35), Color(0xFF5B4778)],
    [Color(0xFFDEBDFC), Color(0xFFBFFFFA)],
    [Color(0xFFFAFCBD), Color(0xFFDEBDFC)],
  ];

  static LinearGradient forKey(String key) {
    final colors = palette[key.hashCode.abs() % palette.length];
    return LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: colors,
    );
  }
}
