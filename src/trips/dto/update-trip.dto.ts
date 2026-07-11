import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** API 명세서 §2.1 PATCH /trips/{tripId}: { title?, startDate?, endDate? }. */
export class UpdateTripDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
