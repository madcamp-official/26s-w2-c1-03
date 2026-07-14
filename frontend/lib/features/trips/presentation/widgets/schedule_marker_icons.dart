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

  static Future<BitmapDescriptor> numbered({
    required int number,
    required Color color,
  }) async {
    final key = '$number-${color.toARGB32()}';
    final cached = _cache[key];
    if (cached != null) return cached;

    const size = 84.0;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final center = const Offset(size / 2, size / 2 - 4);
    const radius = size / 2 - 6;

    // 그림자
    canvas.drawCircle(
      center.translate(0, 2),
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
        ..strokeWidth = 3,
    );

    final textPainter = TextPainter(
      text: TextSpan(
        text: '$number',
        style: const TextStyle(
          color: Colors.white,
          fontSize: 30,
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
    final image = await picture.toImage(size.toInt(), size.toInt());
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final descriptor = BitmapDescriptor.bytes(bytes!.buffer.asUint8List());
    _cache[key] = descriptor;
    return descriptor;
  }
}
