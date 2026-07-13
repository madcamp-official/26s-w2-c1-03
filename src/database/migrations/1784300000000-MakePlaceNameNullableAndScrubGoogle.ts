import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Google Places 약관은 place_id를 제외한 Places 콘텐츠(장소명·주소·좌표)의 캐싱·저장을
 * 금지한다. 검색 결과를 places 테이블에 source=google로 저장하던 구현이 이 콘텐츠를 함께
 * 저장해 약관을 위반했으므로,
 *   1) place_id만 남길 수 있도록 name을 nullable로 바꾸고(기존 NOT NULL이라 null 저장 불가),
 *   2) 이미 저장된 google 행의 Google 콘텐츠(name/address/좌표)를 제거한다(place_id는 저장 허용).
 * TourAPI(source=tourapi) 등 공공누리 데이터는 저장이 허용되므로 그대로 둔다.
 */
export class MakePlaceNameNullableAndScrubGoogle1784300000000 implements MigrationInterface {
  name = 'MakePlaceNameNullableAndScrubGoogle1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "places" ALTER COLUMN "name" DROP NOT NULL`);
    await queryRunner.query(
      `UPDATE "places" SET "name" = NULL, "address" = NULL, "latitude" = NULL, "longitude" = NULL WHERE "source" = 'google'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // name NOT NULL 복원 — null인 행(스크럽된 google 행)은 제약 위반이 되므로 빈 문자열로 채운 뒤 복원한다.
    // 스크럽된 Google 콘텐츠 자체는 약관상 되돌리지 않는다(place_id로 재조회 대상).
    await queryRunner.query(`UPDATE "places" SET "name" = '' WHERE "name" IS NULL`);
    await queryRunner.query(`ALTER TABLE "places" ALTER COLUMN "name" SET NOT NULL`);
  }
}
