import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../config/database.config';

loadEnv();

/**
 * TypeORM CLI 전용 진입점(migration:run/revert/generate). Nest ConfigModule을
 * 거치지 않으므로 dotenv로 직접 .env를 읽는다. 런타임(main.ts)과 옵션은
 * database.config.ts의 buildDataSourceOptions로 통일한다.
 */
export const AppDataSource = new DataSource(buildDataSourceOptions(process.env.DATABASE_URL ?? ''));
