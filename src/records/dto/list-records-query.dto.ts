import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** API 명세서 §5 GET /records: cursor 기반 페이지네이션(§0), TripsService.list와 동일 패턴. */
export class ListRecordsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
