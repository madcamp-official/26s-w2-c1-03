import 'package:firebase_storage/firebase_storage.dart';
import 'package:image_picker/image_picker.dart';

sealed class ProfileImagePickResult {
  const ProfileImagePickResult();
}

class ProfileImagePicked extends ProfileImagePickResult {
  const ProfileImagePicked(this.downloadUrl);
  final String downloadUrl;
}

class ProfileImagePickCancelled extends ProfileImagePickResult {
  const ProfileImagePickCancelled();
}

class ProfileImagePickFailed extends ProfileImagePickResult {
  const ProfileImagePickFailed(this.message);
  final String message;
}

/// 갤러리에서 사진을 골라 Firebase Storage에 올리고 다운로드 URL을 반환한다.
/// plan.md §11.1과 동일하게 백엔드는 파일을 다루지 않고, 클라이언트가 스토리지에
/// 직접 업로드한 뒤 반환된 URL만 PATCH /users/me로 전달한다(Supabase Storage 대신
/// Firebase Storage를 쓰는 것만 다르다).
///
/// 이 앱은 Firebase Auth가 아니라 자체 JWT로 인증하므로, Storage 보안 규칙이
/// `request.auth`를 요구하면 업로드가 permission-denied로 막힌다. `profile-images/**`
/// 경로는 인증 없이 쓸 수 있도록 Firebase 콘솔에서 규칙을 열어둬야 한다.
class ProfileImageUploadService {
  ProfileImageUploadService({ImagePicker? imagePicker, FirebaseStorage? storage})
    : _imagePicker = imagePicker ?? ImagePicker(),
      _storage = storage ?? FirebaseStorage.instance;

  final ImagePicker _imagePicker;
  final FirebaseStorage _storage;

  Future<ProfileImagePickResult> pickAndUpload({required String userId}) async {
    final XFile? picked;
    try {
      picked = await _imagePicker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
    } catch (e) {
      return ProfileImagePickFailed('사진을 불러오지 못했어요: $e');
    }
    if (picked == null) {
      return const ProfileImagePickCancelled();
    }

    try {
      final extension = _extensionOf(picked.name);
      final ref = _storage.ref(
        'profile-images/$userId/${DateTime.now().millisecondsSinceEpoch}$extension',
      );
      await ref.putData(
        await picked.readAsBytes(),
        SettableMetadata(contentType: picked.mimeType ?? 'image/jpeg'),
      );
      final url = await ref.getDownloadURL();
      return ProfileImagePicked(url);
    } on FirebaseException catch (e) {
      return ProfileImagePickFailed('업로드에 실패했어요: ${e.message ?? e.code}');
    } catch (e) {
      return ProfileImagePickFailed('업로드에 실패했어요: $e');
    }
  }

  String _extensionOf(String fileName) {
    final dotIndex = fileName.lastIndexOf('.');
    if (dotIndex == -1 || dotIndex == fileName.length - 1) {
      return '.jpg';
    }
    return fileName.substring(dotIndex);
  }
}
