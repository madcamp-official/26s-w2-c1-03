import 'package:flutter/material.dart';

/// design.md §2 색상 시스템. 화면 코드에서 hex를 직접 쓰지 말고 이 토큰을 쓴다.
abstract final class AppColors {
  // §2.1 베이스
  static const canvas = Color(0xFFBFFFFA);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFF4FFFE);
  static const surfaceSubtle = Color(0xFFE7FFFC);
  static const border = Color(0xFFD8F7F4);
  static const borderStrong = Color(0xFFDEBDFC);

  // §2.2 텍스트 그레이스케일 (잉크)
  static const ink900 = Color(0xFF211A35);
  static const ink600 = Color(0xFF4B4263);
  static const ink400 = Color(0xFF766C8B);
  static const ink300 = Color(0xFFA79CBC);
  static const ink200 = Color(0xFFD6CAE8);

  // §2.3 브랜드 파스텔
  static const lime = Color(0xFFFAFCBD);
  static const green900 = Color(0xFF211A35);
  static const green800 = Color(0xFF5B4778);
  static const green700 = Color(0xFF4B4263);

  // 상태
  static const danger = Color(0xFFD14343);
  static const dangerBg = Color(0xFFFFF1F1);

  /// 여행 상세 화면 지도 마커·목록 배지 — 장소 카테고리 색 구분(attraction/restaurant/cafe/기타).
  static const categoryAttraction = Color(0xFF5B4778);
  static const categoryRestaurant = Color(0xFF8A7A24);
  static const categoryCafe = Color(0xFF21746D);
  static const categoryDefault = Color(0xFF4B4263);
}
