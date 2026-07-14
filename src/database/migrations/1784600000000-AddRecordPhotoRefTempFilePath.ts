import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 11 BE ③. 업로드된 임시 버퍼 파일 경로를 추적하기 위한 컬럼 — 사진
 * 실물이 아니라 로컬 디스크 경로 문자열만 저장한다(§8.3). curate/finalize/TTL
 * cron이 이 경로로 파일을 찾아 처리·폐기한다.
 */
export class AddRecordPhotoRefTempFilePath1784600000000 implements MigrationInterface {
  name = 'AddRecordPhotoRefTempFilePath1784600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "record_photo_refs" ADD "temp_file_path" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "record_photo_refs" DROP COLUMN "temp_file_path"`);
  }
}
