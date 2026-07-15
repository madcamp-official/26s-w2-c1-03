import 'package:flutter/material.dart';

/// design.md §2 색상 시스템. 화면 코드에서 hex를 직접 쓰지 말고 이 토큰을 쓴다.
abstract final class AppColors {
  // §2.1 베이스
  static const canvas = Color(0xFFEEEEEE);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFF2F3F5);
  static const surfaceSubtle = Color(0xFFF2F3F5);
  static const border = Color(0xFFEEEEEE);
  static const borderStrong = Color(0xFFEEEEEE);

  // §2.2 텍스트 그레이스케일 (잉크)
  static const ink900 = Color(0xFF1A1A1A);
  static const ink600 = Color(0xFF8B8D91);
  static const ink400 = Color(0xFF8B8D91);
  static const ink300 = Color(0xFFC4C6CA);
  static const ink200 = Color(0xFFEEEEEE);

  // §2.3 브랜드 포인트(민트그린) — DAY 배지·아이콘·타임라인 점·시간 강조 텍스트.
  // lime이라는 이름은 예전 라임색 팔레트의 잔재라 색상 자체와는 안 맞지만,
  // 코드 전체에서 참조하는 토큰명이라 그대로 유지한다(값만 교체).
  static const lime = Color(0xFF12B886);
  /// 작은 배지/원형 아이콘의 옅은 민트 배경 — lime(포인트색)과 짝을 이뤄 쓴다.
  static const limeBg = Color(0xFFE3F9F0);
  /// D-day 카드·primary 버튼처럼 lime을 큰 배경으로 쓸 때 그 위에 얹는 텍스트/아이콘 색.
  static const onLime = Color(0xFFFFFFFF);

  // 상태
  static const danger = Color(0xFFD14343);
  static const dangerBg = Color(0xFFFFF1F1);

  /// 여행 상세 화면 지도 마커·목록 배지 — 장소 카테고리 색 구분(attraction/restaurant/cafe/기타).
  static const categoryAttraction = Color(0xFF5B4778);
  static const categoryRestaurant = Color(0xFF8A7A24);
  static const categoryCafe = Color(0xFF21746D);
  static const categoryDefault = Color(0xFF4B4263);
}
