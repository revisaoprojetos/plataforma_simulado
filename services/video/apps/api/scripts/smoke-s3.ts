/* Valida o bucket real: put/get, URL pré-assinada, multipart e CORS. Uso: npm run smoke:s3 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from '../src/config/env';
import { StorageService } from '../src/storage/storage.service';

function loadDotenv(path: string): void {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined)
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* sem .env: usa o ambiente */
  }
}

const results: { name: string; ok: boolean; detail?: string }[] = [];
async function step(name: string, fn: () => Promise<string | void>): Promise<void> {
  try {
    results.push({ name, ok: true, detail: (await fn()) || undefined });
  } catch (e) {
    results.push({ name, ok: false, detail: (e as Error).message });
  }
}

async function main(): Promise<void> {
  loadDotenv(resolve(__dirname, '../../../.env'));
  const env = parseEnv({
    ...process.env,
    DATABASE_URL: 'x',
    REDIS_URL: 'x',
    JWT_ACCESS_SECRET: 'x'.repeat(16),
    JWT_REFRESH_SECRET: 'y'.repeat(16),
  });
  const storage = new StorageService(env);
  const prefix = `_smoke/${Date.now()}`;
  const key = `${prefix}/hello.txt`;

  await step('bucket acessível', () => storage.ping());
  await step('put + get', async () => {
    await storage.put(key, 'ola', 'text/plain');
    const back = (await storage.get(key)).toString();
    if (back !== 'ola') throw new Error(`conteúdo inesperado: ${back}`);
  });
  await step('URL pré-assinada GET', async () => {
    const res = await fetch(await storage.presignGet(key, 60));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
  await step('multipart presigned (2 partes de 5 MiB)', async () => {
    const mpKey = `${prefix}/multipart.bin`;
    const uploadId = await storage.createMultipart(mpKey, 'application/octet-stream');
    try {
      const parts = [];
      for (const n of [1, 2]) {
        const res = await fetch(await storage.presignPart(mpKey, uploadId, n), {
          method: 'PUT',
          body: Buffer.alloc(5 * 1024 * 1024, n),
        });
        const etag = res.headers.get('etag');
        if (!res.ok || !etag) throw new Error(`parte ${n}: HTTP ${res.status}, etag=${etag}`);
        parts.push({ partNumber: n, etag });
      }
      await storage.completeMultipart(mpKey, uploadId, parts);
      await storage.delete(mpKey);
    } catch (e) {
      await storage.abortMultipart(mpKey, uploadId).catch(() => undefined);
      throw e;
    }
  });
  await step('CORS (preflight PUT de origem externa)', async () => {
    const url = await storage.presignGet(key, 60);
    const res = await fetch(url, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'PUT' },
    });
    const allow = res.headers.get('access-control-allow-origin');
    if (!allow)
      throw new Error('bucket sem CORS configurado (necessário para upload direto do navegador)');
    return `allow-origin=${allow}`;
  });
  await step('limpeza', () => storage.delete(key));

  for (const r of results)
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

void main();
