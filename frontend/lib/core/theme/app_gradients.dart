import 'package:flutter/material.dart';

/// design.md §2.5 썸네일 플레이스홀더 그라디언트. 실제 사진이 없는 자리(여행지 대표
/// 이미지 등)에 문자열(예: 여행 id)을 해시해서 결정적으로 하나를 배정한다.
abstract final class AppGradients {
  static const List<List<Color>> palette = [
    [Color(0xFFFFD9B3), Color(0xFFFFB88C)], // 오렌지
    [Color(0xFFBFD7FF), Color(0xFF8CB4FF)], // 블루
    [Color(0xFFE3D0FF), Color(0xFFC6A6FF)], // 퍼플
    [Color(0xFFFFB9C8), Color(0xFFFF8BA5)], // 핑크
    [Color(0xFFB7EFC9), Color(0xFF8CDBA8)], // 민트
    [Color(0xFFFFC9A3), Color(0xFFFF9E7C)], // 피치
    [Color(0xFFA9E2FF), Color(0xFF7CBBFF)], // 스카이
    [Color(0xFFFFDF9E), Color(0xFFFFC46B)], // 옐로우
    [Color(0xFFD8C7FF), Color(0xFFB69CFF)], // 라벤더
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
