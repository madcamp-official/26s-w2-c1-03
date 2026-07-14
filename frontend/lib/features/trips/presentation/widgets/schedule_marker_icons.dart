import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../../../../core/theme/app_colors.dart';

/// 스케줄 장소 category → 배지/마커 색. custom(직접 입력, category=null)은 기본색.
Color categoryColor(String? category) {
  return switch (category) {
    'attraction' => AppColors.categoryAttraction,
    'restaurant' => AppColors.categoryRestaurant,
    'cafe' => AppColors.categoryCafe,
    _ => AppColors.categoryDefault,
  };
}

/// "N번 숫자 + 카테고리색 원" 커스텀 지도 마커를 만들어 캐싱한다. google_maps_flutter는
/// 색이 있는 숫자 핀을 기본 제공하지 않아 Canvas로 직접 그려 비트맵으로 굽는다.
class ScheduleMarkerIcons {
  ScheduleMarkerIcons._();

  static final Map<String, BitmapDescriptor> _cache = {};

  /// 지도 위에 실제로 찍힐 마커 지름(논리 픽셀, dp) — 구글 기본 핀과 비슷한 크기.
  static const double _targetSize = 30.0;
  /// 고해상도 화면에서 흐릿하지 않게 그 배수로 래스터화한다.
  static const double _pixelRatio = 3.0;

  static Future<BitmapDescriptor> numbered({
    required int number,
    required Color color,
  }) async {
    final key = '$number-${color.toARGB32()}';
    final cached = _cache[key];
    if (cached != null) return cached;

    final rasterSize = _targetSize * _pixelRatio;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final center = Offset(rasterSize / 2, rasterSize / 2 - rasterSize * 0.04);
    final radius = rasterSize / 2 - rasterSize * 0.08;

    // 그림자
    canvas.drawCircle(
      center.translate(0, rasterSize * 0.03),
      radius,
      Paint()..color = Colors.black.withValues(alpha: 0.18),
    );
    // 원 본체 + 흰 테두리
    canvas.drawCircle(center, radius, Paint()..color = color);
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = rasterSize * 0.045,
    );

    final textPainter = TextPainter(
      text: TextSpan(
        text: '$number',
        style: TextStyle(
          color: Colors.white,
          fontSize: rasterSize * 0.4,
          fontWeight: FontWeight.w800,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    textPainter.paint(
      canvas,
      center - Offset(textPainter.width / 2, textPainter.height / 2),
    );

    final picture = recorder.endRecording();
    final image = await picture.toImage(rasterSize.round(), rasterSize.round());
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final descriptor = BitmapDescriptor.bytes(
      bytes!.buffer.asUint8List(),
      width: _targetSize,
      height: _targetSize,
    );
    _cache[key] = descriptor;
    return descriptor;
  }
}
