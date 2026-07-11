import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4(Auth). InitialSchema(Phase 3)에는 없던 refresh_tokens 테이블을 추가한다.
 * 손으로 작성한 마이그레이션이라 제약조건 이름은 TypeORM CLI의 해시 네이밍 대신
 * 사람이 읽을 수 있는 이름을 쓴다(구조 자체는 InitialSchema와 동일한 패턴 유지:
 * CREATE TABLE → CREATE UNIQUE INDEX → ALTER TABLE ADD CONSTRAINT FK 순서).
 */
export class AddRefreshTokens1783734477354 implements MigrationInterface {
  name = 'AddRefreshTokens1783734477354';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_refresh_tokens_token_hash" ON "refresh_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_refresh_tokens_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_refresh_tokens_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_token_hash"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
