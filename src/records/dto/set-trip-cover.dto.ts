import { IsUUID } from 'class-validator';

/** API 명세서 §2.6 PUT /trips/{tripId}/cover. */
export class SetTripCoverDto {
  @IsUUID()
  recordPhotoId: string;
}
