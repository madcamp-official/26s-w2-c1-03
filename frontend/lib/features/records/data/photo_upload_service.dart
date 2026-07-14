import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;
import 'package:photo_manager/photo_manager.dart';

/// 사진 실물을 업로드용 바이트로 변환한다. 재인코딩 자체가 EXIF를 지운다(§8.2
/// "OpenAI로 전송되는 이미지는 EXIF가 완전히 제거된 상태" — 업로드 시점부터
/// 이미 지워둬야 서버의 curate 단계 "이중 스트립"이 말 그대로 두 번째 스트립이
/// 된다). 디코드/인코드는 무거운 연산이라 compute()로 별도 isolate에서 돌린다.
class PhotoUploadService {
  Future<Uint8List?> prepareBytes(AssetEntity asset) async {
    final original = await asset.originBytes;
    if (original == null) {
      // iCloud 등 원격 저장소에 있는 원본이 기기로 다운로드되지 않은 경우 등에
      // null이 돌아온다 — 조용히 스킵되면 업로드 실패 원인 추적이 불가능해지므로
      // 최소한 디버그 로그로 남긴다(§record_upload_screen.dart의 전량 실패 처리와 짝).
      debugPrint('PhotoUploadService: originBytes null for asset ${asset.id}');
      return null;
    }
    return compute(_stripExif, original);
  }

  static Uint8List _stripExif(Uint8List original) {
    final decoded = img.decodeImage(original);
    if (decoded == null) return original;
    // encodeJpg는 명시적으로 넘기지 않는 한 원본 exif를 복사하지 않는다 — 재인코딩
    // 자체가 스트립이다.
    return img.encodeJpg(decoded, quality: 85);
  }
}
