import '../../auth/data/auth_models.dart';

sealed class ProfileState {
  const ProfileState();
}

class ProfileLoading extends ProfileState {
  const ProfileLoading();
}

class ProfileLoaded extends ProfileState {
  const ProfileLoaded(this.user);
  final AuthUser user;
}

class ProfileFailed extends ProfileState {
  const ProfileFailed(this.code, this.message);
  final String code;
  final String message;
}
