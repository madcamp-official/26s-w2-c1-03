import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** API 명세서 §2.1 POST /trips: { title, cityName, areaCode, sigunguCode, startDate, endDate }. */
export class CreateTripDto {
  @IsString()
  @MaxLength(100)
  title: string;

  @IsString()
  @MaxLength(100)
  cityName: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  areaCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  sigunguCode?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
