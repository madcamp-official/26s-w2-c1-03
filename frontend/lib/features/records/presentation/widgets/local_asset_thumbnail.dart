import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:photo_manager/photo_manager.dart';
import '../../../../core/theme/app_colors.dart';

const _thumbnailSize = ThumbnailSize.square(300);

/// 서버 미리보기 URL 없이(사용자 직접 선택 모드는 curate/candidates를 안 거치므로
/// 서버가 만들어주는 서명 URL이 없다) 기기 사진첩 썸네일을 그대로 보여준다.
/// RecordManualPickScreen(고르는 중)과 RecordManualCaptionScreen(캡션 다는 중)
/// 둘 다에서 같은 방식으로 쓰여서 공용 위젯으로 뺐다.
class LocalAssetThumbnail extends StatelessWidget {
  const LocalAssetThumbnail({super.key, required this.asset});

  final AssetEntity asset;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Uint8List?>(
      future: asset.thumbnailDataWithSize(_thumbnailSize),
      builder: (context, snapshot) {
        final bytes = snapshot.data;
        if (bytes == null) {
          return Container(color: AppColors.surfaceSubtle);
        }
        return Image.memory(bytes, fit: BoxFit.cover);
      },
    );
  }
}
