import { IsNotEmpty, IsString } from 'class-validator';

/** /auth/token/refresh 와 /auth/logout이 공유하는 { refreshToken } 요청 형태. */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
