import 'package:flutter/material.dart';

/// design.md §2 색상 시스템. 화면 코드에서 hex를 직접 쓰지 말고 이 토큰을 쓴다.
abstract final class AppColors {
  // §2.1 베이스
  static const canvas = Color(0xFFEEF1F4);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFF9FAFB);
  static const surfaceSubtle = Color(0xFFF2F4F6);
  static const border = Color(0xFFF2F4F6);
  static const borderStrong = Color(0xFFEAECEF);

  // §2.2 텍스트 그레이스케일 (잉크)
  static const ink900 = Color(0xFF191F28);
  static const ink600 = Color(0xFF4E5968);
  static const ink400 = Color(0xFF8B95A1);
  static const ink300 = Color(0xFFB0B8C1);
  static const ink200 = Color(0xFFD1D6DB);

  // §2.3 브랜드 라임
  static const lime = Color(0xFFFAFCBD);
  static const green900 = Color(0xFF0B3D2A);
  static const green800 = Color(0xFF0F5132);
  static const green700 = Color(0xFF14532D);

  // 상태
  static const danger = Color(0xFFD14343);
  static const dangerBg = Color(0xFFFFF1F1);

  /// 여행 상세 화면 지도 마커·목록 배지 — 장소 카테고리 색 구분(attraction/restaurant/cafe/기타).
  static const categoryAttraction = Color(0xFF7C6FF0);
  static const categoryRestaurant = Color(0xFFE0575B);
  static const categoryCafe = Color(0xFFC9832E);
  static const categoryDefault = Color(0xFF4C86E0);
}
