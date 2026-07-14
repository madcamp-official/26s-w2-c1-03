import { IsEnum } from 'class-validator';
import { TripMemberRole } from '../entities/trip-member.entity';

/** API 명세서 §3.1 PATCH /trips/{tripId}/members/{userId}: { role }. */
export class UpdateMemberRoleDto {
  @IsEnum(TripMemberRole)
  role: TripMemberRole;
}
