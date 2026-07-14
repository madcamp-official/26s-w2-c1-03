import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

/** API 명세서 §2.3 selectedPlaces 배열의 원소 — 후보 조회(§2.2)에서 받은 place.id(UUID)와,
 *  사용자가 그 장소를 배치하고 싶은 날짜(1부터 여행 일수까지)다. */
export class SelectedPlaceDto {
  @IsUUID()
  placeId: string;

  @IsInt()
  @Min(1)
  dayNumber: number;
}

/**
 * API 명세서 §2.3 POST /trips/{tripId}/schedule/generate 요청 바디.
 * selectedPlaces는 사용자가 고른 장소와 각 장소를 배치할 날짜의 목록이다.
 */
export class GenerateScheduleDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SelectedPlaceDto)
  selectedPlaces: SelectedPlaceDto[];
}
