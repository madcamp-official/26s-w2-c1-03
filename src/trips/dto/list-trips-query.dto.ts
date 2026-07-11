import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TripStatus } from '../entities/trip.entity';

/** API 명세서 §2.1 GET /trips: ?status=planning|ongoing|completed, cursor 기반 페이지네이션(§0). */
export class ListTripsQueryDto {
  @IsOptional()
  @IsIn(Object.values(TripStatus))
  status?: TripStatus;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
