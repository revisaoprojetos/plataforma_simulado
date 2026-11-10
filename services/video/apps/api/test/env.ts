import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const TEST_DB = 'video_test';
export const TEST_REDIS_DB = 15;

function loadDotenv(path: string): void {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined)
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* sem .env (ex.: CI): usa o ambiente */
  }
}

/** Troca só o nome do banco da URL (preserva usuário, senha, host e porta). */
export function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

/** Prepara o ambiente de teste: lê o .env da raiz e aponta para o banco de teste. */
export function loadTestEnv(): void {
  loadDotenv(resolve(__dirname, '../../../.env'));
  const defaults: Record<string, string> = {
    DATABASE_URL: 'postgresql://video:video@localhost:5441/video',
    REDIS_URL: 'redis://localhost:6380',
    S3_ENDPOINT: 'https://s3.invalid.test',
    S3_REGION: 'test',
    S3_BUCKET: 'test',
    S3_ACCESS_KEY: 'test',
    S3_SECRET_KEY: 'test',
    JWT_ACCESS_SECRET: 'test-access-secret-0123456789',
    JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789',
    PROGRESS_FLUSH_INTERVAL_MS: '0',
    UPLOAD_SWEEP_INTERVAL_MS: '0',
    REPORT_CACHE_TTL_S: '0', // o teste de cache liga por conta própria
    // Os testes fazem muitas requisições do mesmo "cliente"; os limites têm suíte própria (security.e2e-spec).
    RATE_LIMIT_ENABLED: 'false',
    LOG_LEVEL: 'silent',
  };
  for (const [k, v] of Object.entries(defaults)) process.env[k] ??= v;
  // Nunca roda testes (que apagam dados) contra o banco de desenvolvimento.
  process.env.DATABASE_URL = withDatabase(process.env.DATABASE_URL!, TEST_DB);
  process.env.DIRECT_URL = process.env.DATABASE_URL; // exigida pelo Prisma CLI (directUrl no schema)
  // Redis separado (db 15): o consolidador da API em execução (docker compose) lê a fila do db 0
  // e roubaria/descartaria os eventos dos testes.
  process.env.REDIS_URL = withDatabase(process.env.REDIS_URL!, String(TEST_REDIS_DB));
  process.env.NODE_ENV = 'test';
}
