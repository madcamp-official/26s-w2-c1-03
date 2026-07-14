import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** API 명세서 §3.1 POST /trips/{tripId}/invite-links: { expiresInHours? }. */
export class CreateInviteLinkDto {
  /** 생략 시 만료 없는 링크(expiresAt=null). 최대 30일(720시간). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  expiresInHours?: number;
}
