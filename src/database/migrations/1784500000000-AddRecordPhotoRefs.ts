import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 11 BE ②. 사진 파이프라인의 임시 참조 테이블(photos/metadata~finalize
 * 구간, API 명세서 §4). record_photos(최종 선택분만)와 분리된 이유는 §8.3 —
 * 사진 실물은 여기 저장하지 않고 텍스트 메타데이터와 진행 상태만 추적한다.
 * TypeORM CLI(migration:generate)가 이 환경에서 yargs ESM 문제로 깨져 있어
 * AddRefreshTokens 마이그레이션과 같은 손으로 쓴 스타일을 그대로 따른다.
 */
export class AddRecordPhotoRefs1784500000000 implements MigrationInterface {
  name = 'AddRecordPhotoRefs1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "record_photo_refs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "record_id" uuid NOT NULL, "local_id" character varying(200) NOT NULL, "taken_at" TIMESTAMP WITH TIME ZONE, "location_name" character varying(200), "status" character varying(20) NOT NULL DEFAULT 'pending', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_record_photo_refs" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_record_photo_refs_record_id_local_id" ON "record_photo_refs" ("record_id", "local_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "record_photo_refs" ADD CONSTRAINT "FK_record_photo_refs_record_id" FOREIGN KEY ("record_id") REFERENCES "travel_records"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "record_photo_refs" DROP CONSTRAINT "FK_record_photo_refs_record_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_record_photo_refs_record_id_local_id"`);
    await queryRunner.query(`DROP TABLE "record_photo_refs"`);
  }
}
