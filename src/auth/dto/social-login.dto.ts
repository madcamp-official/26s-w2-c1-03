import { IsOptional, IsString } from 'class-validator';

/** API 명세서 §1: { idToken | authorizationCode }. 카카오/구글은 이번 Phase에서 idToken만 지원. */
export class SocialLoginDto {
  @IsOptional()
  @IsString()
  idToken?: string;

  @IsOptional()
  @IsString()
  authorizationCode?: string;
}
