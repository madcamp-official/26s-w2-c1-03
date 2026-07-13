import { AppDataSource } from './data-source';

/**
 * 마지막 마이그레이션 되돌리기 — run-migrations.ts와 같은 이유로 TypeORM CLI를 우회하고
 * DataSource API(undoLastMigration)를 직접 호출한다. (npm run migration:revert)
 */
async function revert(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await AppDataSource.undoLastMigration();
    console.log('마지막 마이그레이션을 되돌렸습니다.');
  } finally {
    await AppDataSource.destroy();
  }
}

revert().catch((error) => {
  console.error('마이그레이션 되돌리기 실패:', error);
  process.exit(1);
});
