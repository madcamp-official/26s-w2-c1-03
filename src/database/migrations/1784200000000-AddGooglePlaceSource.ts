import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 장소 검색을 TourAPI searchKeyword2 → Google Places Text Search로 교체하면서,
 * Google 검색 결과를 places 테이블에 캐싱하기 위해 place_source enum에 'google'을 추가한다.
 *
 * PostgreSQL 12+는 트랜잭션 안에서도 ALTER TYPE ... ADD VALUE가 가능하다(단, 같은
 * 트랜잭션 안에서 그 값을 사용할 수는 없음). 이 마이그레이션은 값만 추가하고 사용하지
 * 않으므로 문제없다(Supabase = PG 15).
 */
export class AddGooglePlaceSource1784200000000 implements MigrationInterface {
  name = 'AddGooglePlaceSource1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."place_source" ADD VALUE IF NOT EXISTS 'google'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL은 enum 값 제거를 지원하지 않는다(타입 재생성 필요). 값 추가만 하는
    // 마이그레이션이라 down은 no-op으로 둔다 — 롤백해도 'google' 값은 남는다.
  }
}
