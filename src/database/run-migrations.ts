import { AppDataSource } from './data-source';

/**
 * 마이그레이션 실행기 — TypeORM CLI(cli.js)를 우회한다. TypeORM 1.0의 CLI는 ESM 전용
 * yargs(^18)를 require해 CommonJS(ts-node) 환경에서 ERR_REQUIRE_ESM으로 죽으므로, CLI
 * 대신 DataSource API(runMigrations)를 직접 호출한다. 런타임 import 경로는 yargs를 거치지
 * 않아 이 문제와 무관하다. (npm run migration:run)
 */
async function run(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const migrations = await AppDataSource.runMigrations();
    if (migrations.length === 0) {
      console.log('실행할 마이그레이션이 없습니다(이미 최신 상태).');
    } else {
      console.log(`적용된 마이그레이션 ${migrations.length}개:`);
      migrations.forEach((m) => console.log(`  - ${m.name}`));
    }
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((error) => {
  console.error('마이그레이션 실행 실패:', error);
  process.exit(1);
});
