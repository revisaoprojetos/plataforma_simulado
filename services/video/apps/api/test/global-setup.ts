import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadTestEnv, TEST_DB, withDatabase } from './env';

/** Cria o banco de teste (se não existir) e aplica as migrations. */
export default async function globalSetup(): Promise<void> {
  loadTestEnv();
  const testUrl = process.env.DATABASE_URL!;

  const admin = new PrismaClient({ datasourceUrl: withDatabase(testUrl, 'postgres') });
  try {
    const rows = await admin.$queryRaw<{ n: number }[]>`
      SELECT 1 AS n FROM pg_database WHERE datname = ${TEST_DB}`;
    if (rows.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${TEST_DB}"`);
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
    cwd: resolve(__dirname, '../../..'),
    env: { ...process.env, DATABASE_URL: testUrl, DIRECT_URL: testUrl },
    stdio: 'pipe',
  });
}
