import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/**
 * API 명세서 §2.3 POST /trips/{tripId}/schedule/generate 요청 바디.
 * selectedPlaceIds는 후보 조회(§2.2)에서 받은 place.id(UUID) 배열이다.
 */
export class GenerateScheduleDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  selectedPlaceIds: string[];
}
