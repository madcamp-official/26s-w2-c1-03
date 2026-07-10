import { readFileSync } from 'fs';
import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from './snake-naming.strategy';

/**
 * Nest 런타임(TypeOrmModule.forRootAsync, main.ts)과 TypeORM CLI(migration:run 등,
 * database/data-source.ts)가 같은 연결 설정을 쓰도록 하나로 통일한다.
 * entities는 각 도메인 폴더(§3.2)의 *.entity.ts를 glob으로 수집한다.
 *
 * synchronize는 항상 false — 스키마 변경은 반드시 마이그레이션으로만 한다(plan.md §3, §7).
 *
 * Supabase "Session Pooler"(Supavisor session mode, aws-<region>.pooler.supabase.com:5432,
 * 사용자명 postgres.<project-ref>)를 사용한다. Direct Connection은 기본적으로 IPv6 전용이라
 * 배포 환경이 IPv4-only일 수 있는 점을 고려해 Session Pooler로 선택했다. Session 모드는
 * 클라이언트-서버 커넥션이 세션 동안 1:1로 유지되므로 Direct Connection과 동일하게 prepared
 * statement 등 세션 기능을 그대로 쓸 수 있다(Transaction Pooler는 이게 안 됨).
 * 단, 세션 동안 Postgres 백엔드 커넥션을 그대로 점유하는 건 Direct와 같으므로 풀 크기를
 * 작게 유지해야 한다(아래 extra.max).
 */
export function buildDataSourceOptions(databaseUrl: string): DataSourceOptions {
  const isLocalDb = /localhost|127\.0\.0\.1/.test(databaseUrl);
  const caCertPath = process.env.DATABASE_SSL_CA_PATH;

  return {
    type: 'postgres',
    url: databaseUrl,
    // 로컬 검증용 DB(Docker 등)는 SSL을 강제하지 않는다. Supabase는 SSL 필수.
    // DATABASE_SSL_CA_PATH를 지정하면 대시보드에서 받은 루트 인증서로 완전 검증(verify-full)하고,
    // 없으면 전송 구간 암호화만 적용한다(인증서 체인 미검증 — 빠른 시작용, 운영 전 CA 적용 권장).
    ssl: isLocalDb
      ? false
      : caCertPath
        ? { ca: readFileSync(caCertPath, 'utf-8'), rejectUnauthorized: true }
        : { rejectUnauthorized: false },
    // Session Pooler는 트랜잭션 단위로 커넥션을 돌려쓰는 게 아니라 세션 동안 백엔드를 점유한다.
    // 단일 서버 배포 전제(plan.md §14)에서 프로젝트 max_connections 예산을 넘지 않도록 보수적으로 설정.
    extra: isLocalDb ? undefined : { max: 10, idleTimeoutMillis: 30000 },
    namingStrategy: new SnakeNamingStrategy(),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    synchronize: false,
    logging: process.env.NODE_ENV === 'local',
  };
}
