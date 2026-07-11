import { IsIn, IsNotEmpty, IsString } from 'class-validator';

/** API 명세서 §1 POST /users/me/devices: { pushToken, platform }. */
export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  pushToken: string;

  @IsIn(['ios', 'android'])
  platform: string;
}
