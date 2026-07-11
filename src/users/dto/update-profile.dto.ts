import { IsOptional, IsString, MaxLength } from 'class-validator';

/** API 명세서 §1 PATCH /users/me: { nickname?, profileImageUrl? }. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  nickname?: string;

  @IsOptional()
  @IsString()
  profileImageUrl?: string;
}
