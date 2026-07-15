import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 12. 기록을 Day별로 묶어 보여주는 다이어리 뷰(record_id, date)당 제목/
 * 본문/대표사진 하나씩. record_photos(사진 실물+캡션)와 분리된 테이블이라
 * photo_id는 nullable + ON DELETE SET NULL로 둔다 — 대표사진으로 고른 사진이
 * 나중에 삭제돼도 Day 항목의 제목/본문 텍스트는 남아야 한다. TypeORM CLI가 이
 * 환경에서 깨져 있어(AddRecordPhotoRefs 마이그레이션 주석 참고) 손으로 쓴다.
 */
export class AddRecordDayEntries1784800000000 implements MigrationInterface {
  name = 'AddRecordDayEntries1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "record_day_entries" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "record_id" uuid NOT NULL, "date" date NOT NULL, "title" character varying(100), "content" text, "photo_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_record_day_entries" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_record_day_entries_record_id_date" ON "record_day_entries" ("record_id", "date")`,
    );
    await queryRunner.query(
      `ALTER TABLE "record_day_entries" ADD CONSTRAINT "FK_record_day_entries_record_id" FOREIGN KEY ("record_id") REFERENCES "travel_records"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "record_day_entries" ADD CONSTRAINT "FK_record_day_entries_photo_id" FOREIGN KEY ("photo_id") REFERENCES "record_photos"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "record_day_entries" DROP CONSTRAINT "FK_record_day_entries_photo_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "record_day_entries" DROP CONSTRAINT "FK_record_day_entries_record_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_record_day_entries_record_id_date"`);
    await queryRunner.query(`DROP TABLE "record_day_entries"`);
  }
}
