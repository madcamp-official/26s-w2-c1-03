import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1783682555366 implements MigrationInterface {
  name = 'InitialSchema1783682555366';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // gen_random_uuid() 기본값에 필요. Supabase는 기본 활성화지만 다른 Postgres 환경 대비 명시.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(
      `CREATE TYPE "public"."provider_type" AS ENUM('kakao', 'apple', 'google')`,
    );
    await queryRunner.query(
      `CREATE TABLE "social_accounts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "provider" "public"."provider_type" NOT NULL, "provider_uid" character varying(255) NOT NULL, "email" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e9e58d2d8e9fafa20af914d9750" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_9bdcac6e8e527b2b8634b6b1fe" ON "social_accounts"  ("provider", "provider_uid") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_devices" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "push_token" text NOT NULL, "platform" character varying(10) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_active_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c9e7e648903a9e537347aba4371" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "nickname" character varying(30) NOT NULL, "profile_image_url" text, "status" character varying(20) NOT NULL DEFAULT 'active', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "withdrawn_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."member_role" AS ENUM('owner', 'editor', 'viewer')`,
    );
    await queryRunner.query(
      `CREATE TABLE "trip_members" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "trip_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role" "public"."member_role" NOT NULL DEFAULT 'editor', "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d0368bd704fcb6883af326d8285" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_9f2ed7f6cebbb601b66d2847e6" ON "trip_members"  ("trip_id", "user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "trip_invite_links" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "trip_id" uuid NOT NULL, "token" character varying(64) NOT NULL, "created_by" uuid NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_682802a7dd3d039d53583153e0f" UNIQUE ("token"), CONSTRAINT "PK_1e00d945fbfac95fc9e7b53bb8a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."trip_status" AS ENUM('planning', 'ongoing', 'completed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "trips" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "owner_id" uuid NOT NULL, "title" character varying(100) NOT NULL, "city_name" character varying(100) NOT NULL, "area_code" character varying(10), "sigungu_code" character varying(10), "start_date" date NOT NULL, "end_date" date NOT NULL, "status" "public"."trip_status" NOT NULL DEFAULT 'planning', "cover_image_url" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_f71c231dee9c05a9522f9e840f5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_type" AS ENUM('trip_end_reminder', 'trip_invite')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "trip_id" uuid, "type" "public"."notification_type" NOT NULL, "sent_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "clicked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_19c524e644cdeaebfcffc284871" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."place_source" AS ENUM('tourapi', 'kakao', 'custom')`,
    );
    await queryRunner.query(
      `CREATE TABLE "places" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "source" "public"."place_source" NOT NULL DEFAULT 'tourapi', "external_id" character varying(50), "content_type_id" character varying(10), "name" character varying(200) NOT NULL, "address" character varying(300), "latitude" numeric(10,7), "longitude" numeric(10,7), "area_code" character varying(10), "sigungu_code" character varying(10), "category_code" character varying(20), "tel" character varying(50), "image_url" text, "overview" text, "synced_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1afab86e226b4c3bc9a74465c12" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c1dc45ac998018172debf6a7b2" ON "places"  ("latitude", "longitude") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cbefcc5c88be7150f41a157737" ON "places"  ("area_code", "sigungu_code") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_21cadf7d1e7528147ea107415a" ON "places"  ("source", "external_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "travel_records" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "trip_id" uuid NOT NULL, "user_id" uuid NOT NULL, "title" character varying(100), "content" text, "status" character varying(20) NOT NULL DEFAULT 'draft', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_d4f8ed648de0b7ef4f77d7c9d7f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a1fd85bfc94d85f494c3acef6e" ON "travel_records"  ("trip_id", "user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "record_photos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "record_id" uuid NOT NULL, "storage_url" text NOT NULL, "taken_at" TIMESTAMP WITH TIME ZONE, "location_name" character varying(200), "caption" text, "order_index" integer NOT NULL DEFAULT '0', "is_cover" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f20798bd1eb500526a8289c3198" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4bd3cd90ed121e6b80cd724be9" ON "record_photos"  ("record_id", "order_index") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ai_plan_requests" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "trip_id" uuid NOT NULL, "requested_by" uuid NOT NULL, "prompt_text" text NOT NULL, "response_summary" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8d418acc3e0fd145ac6230fa77b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "trip_places" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "trip_id" uuid NOT NULL, "place_id" uuid, "day_number" integer NOT NULL, "order_in_day" integer NOT NULL, "custom_name" character varying(200), "custom_address" character varying(300), "memo" text, "added_by" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6feca897e5ef2ab3d77b035ad48" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1778656829e9a177cdbd478627" ON "trip_places"  ("trip_id", "day_number", "order_in_day") `,
    );
    await queryRunner.query(
      `ALTER TABLE "social_accounts" ADD CONSTRAINT "FK_05a0f282d3bed93ca048a7e54dd" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_devices" ADD CONSTRAINT "FK_28bd79e1b3f7c1168f0904ce241" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_members" ADD CONSTRAINT "FK_2bc25d7b7dd3984a649d49bb9a7" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_members" ADD CONSTRAINT "FK_f5221f69b9fa76f6ac5396f030d" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_invite_links" ADD CONSTRAINT "FK_0aa71ee820a0b1c24489d72e2e4" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_invite_links" ADD CONSTRAINT "FK_316020f3c51dab579bd16022511" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trips" ADD CONSTRAINT "FK_9c8c2dfcf0c36c844af03e277bb" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_logs" ADD CONSTRAINT "FK_f803d5e1bd85942b24ee4248701" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_logs" ADD CONSTRAINT "FK_48ac8dd0c13e18a814cf54d3206" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "travel_records" ADD CONSTRAINT "FK_4d4b69aae18d63c1977302bd799" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "travel_records" ADD CONSTRAINT "FK_1ba9bfbaa5032f4341e932d612b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "record_photos" ADD CONSTRAINT "FK_579c1a8037c257e57d234d6447b" FOREIGN KEY ("record_id") REFERENCES "travel_records"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_plan_requests" ADD CONSTRAINT "FK_bea591f1f11a72b16c6252daeb2" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_plan_requests" ADD CONSTRAINT "FK_746fe17fe9c9db73528c4c2cbb8" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_places" ADD CONSTRAINT "FK_41560e17cc13c38a09eede02af1" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_places" ADD CONSTRAINT "FK_15b8195b102d13d1600459e8bdc" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_places" ADD CONSTRAINT "FK_2d950c647592b848a55d197153b" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "trip_places" DROP CONSTRAINT "FK_2d950c647592b848a55d197153b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_places" DROP CONSTRAINT "FK_15b8195b102d13d1600459e8bdc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_places" DROP CONSTRAINT "FK_41560e17cc13c38a09eede02af1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_plan_requests" DROP CONSTRAINT "FK_746fe17fe9c9db73528c4c2cbb8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_plan_requests" DROP CONSTRAINT "FK_bea591f1f11a72b16c6252daeb2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "record_photos" DROP CONSTRAINT "FK_579c1a8037c257e57d234d6447b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "travel_records" DROP CONSTRAINT "FK_1ba9bfbaa5032f4341e932d612b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "travel_records" DROP CONSTRAINT "FK_4d4b69aae18d63c1977302bd799"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_logs" DROP CONSTRAINT "FK_48ac8dd0c13e18a814cf54d3206"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_logs" DROP CONSTRAINT "FK_f803d5e1bd85942b24ee4248701"`,
    );
    await queryRunner.query(`ALTER TABLE "trips" DROP CONSTRAINT "FK_9c8c2dfcf0c36c844af03e277bb"`);
    await queryRunner.query(
      `ALTER TABLE "trip_invite_links" DROP CONSTRAINT "FK_316020f3c51dab579bd16022511"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_invite_links" DROP CONSTRAINT "FK_0aa71ee820a0b1c24489d72e2e4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_members" DROP CONSTRAINT "FK_f5221f69b9fa76f6ac5396f030d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_members" DROP CONSTRAINT "FK_2bc25d7b7dd3984a649d49bb9a7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_devices" DROP CONSTRAINT "FK_28bd79e1b3f7c1168f0904ce241"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_accounts" DROP CONSTRAINT "FK_05a0f282d3bed93ca048a7e54dd"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_1778656829e9a177cdbd478627"`);
    await queryRunner.query(`DROP TABLE "trip_places"`);
    await queryRunner.query(`DROP TABLE "ai_plan_requests"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4bd3cd90ed121e6b80cd724be9"`);
    await queryRunner.query(`DROP TABLE "record_photos"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a1fd85bfc94d85f494c3acef6e"`);
    await queryRunner.query(`DROP TABLE "travel_records"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_21cadf7d1e7528147ea107415a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cbefcc5c88be7150f41a157737"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c1dc45ac998018172debf6a7b2"`);
    await queryRunner.query(`DROP TABLE "places"`);
    await queryRunner.query(`DROP TYPE "public"."place_source"`);
    await queryRunner.query(`DROP TABLE "notification_logs"`);
    await queryRunner.query(`DROP TYPE "public"."notification_type"`);
    await queryRunner.query(`DROP TABLE "trips"`);
    await queryRunner.query(`DROP TYPE "public"."trip_status"`);
    await queryRunner.query(`DROP TABLE "trip_invite_links"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9f2ed7f6cebbb601b66d2847e6"`);
    await queryRunner.query(`DROP TABLE "trip_members"`);
    await queryRunner.query(`DROP TYPE "public"."member_role"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "user_devices"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9bdcac6e8e527b2b8634b6b1fe"`);
    await queryRunner.query(`DROP TABLE "social_accounts"`);
    await queryRunner.query(`DROP TYPE "public"."provider_type"`);
  }
}
