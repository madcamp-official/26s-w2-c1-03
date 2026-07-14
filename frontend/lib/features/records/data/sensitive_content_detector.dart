import 'package:google_mlkit_barcode_scanning/google_mlkit_barcode_scanning.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

/// OCR/바코드 기반 문서성 사진 자동 제외(기능명세서 §8.4, 수용기준 5) —
/// 여권/신분증/항공권 바코드/신용카드. 신원 식별이 아니라 "이 사진이 문서인가"
/// 만 판별하면 되므로 텍스트 패턴(여권 MRZ, 카드번호)과 바코드 유무만 본다.
///
/// 텍스트 인식 모델은 [TextRecognitionScript.korean]을 쓴다 — 주 사용자층이
/// 한국 신분증(한글+숫자 혼용)을 촬영할 가능성이 높고, 여권 MRZ는 라틴 대문자/
/// 숫자만 쓰므로 한국어 모델로도 인식 가능하다.
class SensitiveContentDetector {
  SensitiveContentDetector()
    : _textRecognizer = TextRecognizer(script: TextRecognitionScript.korean),
      _barcodeScanner = BarcodeScanner(
        formats: const [
          BarcodeFormat.pdf417, // 항공권 종이 탑승권
          BarcodeFormat.aztec, // 모바일 탑승권
          BarcodeFormat.qrCode,
          BarcodeFormat.code128,
        ],
      );

  final TextRecognizer _textRecognizer;
  final BarcodeScanner _barcodeScanner;

  // 여권 MRZ(기계판독영역)는 'A-Z0-9<'로만 구성된 줄이 2~3줄 연속된다(TD3/TD1).
  static final _mrzLinePattern = RegExp(r'^[A-Z0-9<]{20,}$');
  // 카드/증서 번호열: 4자리씩 묶이거나 총 13~19자리 숫자.
  static final _cardNumberPattern = RegExp(r'(?:\d[ -]?){13,19}');

  Future<bool> isDocument(String filePath) async {
    final inputImage = InputImage.fromFilePath(filePath);

    final barcodes = await _barcodeScanner.processImage(inputImage);
    if (barcodes.isNotEmpty) return true;

    final recognized = await _textRecognizer.processImage(inputImage);
    final lines = recognized.blocks
        .expand((block) => block.lines)
        .map((line) => line.text.trim())
        .toList();

    final mrzLineCount = lines.where((l) => _mrzLinePattern.hasMatch(l.replaceAll(' ', ''))).length;
    if (mrzLineCount >= 2) return true;

    return lines.any((l) => _cardNumberPattern.hasMatch(l));
  }

  Future<void> dispose() async {
    await _textRecognizer.close();
    await _barcodeScanner.close();
  }
}
