import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 일정 편집 화면에서 장소별 예상/실제 비용을 기록할 수 있게 컬럼을 추가한다.
 * 정수(원 단위) nullable — 아직 입력하지 않은 항목은 null로 둔다.
 */
export class AddTripPlaceCost1784700000000 implements MigrationInterface {
  name = 'AddTripPlaceCost1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trip_places" ADD COLUMN "cost" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trip_places" DROP COLUMN "cost"`);
  }
}
