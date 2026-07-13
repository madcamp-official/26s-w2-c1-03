import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AI 스케줄이 식사 시간(점심/저녁)에 맞춰 식당·카페를 배치할 수 있게 되면서, 각 방문
 * 항목의 권장 방문 시각을 저장할 컬럼이 필요해졌다. 'HH:MM' 형식 문자열(nullable) —
 * 사용자가 수동 추가한 항목이나 AI가 시간을 정하지 않은 항목은 null로 둔다.
 */
export class AddTripPlaceStartTime1784400000000 implements MigrationInterface {
  name = 'AddTripPlaceStartTime1784400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trip_places" ADD COLUMN "start_time" varchar(5)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trip_places" DROP COLUMN "start_time"`);
  }
}
