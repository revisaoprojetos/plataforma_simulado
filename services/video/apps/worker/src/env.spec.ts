import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from './env';

const base = {
  S3_ENDPOINT: 'https://hel1.your-objectstorage.com',
  S3_REGION: 'hel1',
  S3_BUCKET: 'b',
  S3_ACCESS_KEY: 'a',
  S3_SECRET_KEY: 's',
  DATABASE_URL: 'postgresql://x',
  REDIS_URL: 'redis://x',
};

describe('parseEnv (worker)', () => {
  it('JOB_TIMEOUT_MS: padrão 3 h; cai no FFMPEG_TIMEOUT_MS legado; JOB_TIMEOUT_MS vence', () => {
    expect(parseEnv({ ...base }).JOB_TIMEOUT_MS).toBe(3 * 3600_000);
    expect(parseEnv({ ...base, FFMPEG_TIMEOUT_MS: '1000' }).JOB_TIMEOUT_MS).toBe(1000);
    expect(
      parseEnv({ ...base, FFMPEG_TIMEOUT_MS: '1000', JOB_TIMEOUT_MS: '2000' }).JOB_TIMEOUT_MS,
    ).toBe(2000);
  });

  it('lê segredos de arquivos (*_FILE) sem sobrescrever variável já definida', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gv-env-'));
    try {
      writeFileSync(join(dir, 'sk'), 'segredo-do-arquivo\n');
      writeFileSync(join(dir, 'ak'), 'nao-deve-valer');
      const { S3_SECRET_KEY: _s, ...rest } = base;
      void _s;
      const env = parseEnv({
        ...rest,
        S3_SECRET_KEY_FILE: join(dir, 'sk'),
        S3_ACCESS_KEY_FILE: join(dir, 'ak'),
      });
      expect(env.S3_SECRET_KEY).toBe('segredo-do-arquivo');
      expect(env.S3_ACCESS_KEY).toBe('a');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('erro claro quando o arquivo de segredo não existe', () => {
    const { S3_SECRET_KEY: _s, ...rest } = base;
    void _s;
    expect(() => parseEnv({ ...rest, S3_SECRET_KEY_FILE: '/nao/existe' })).toThrow(
      /S3_SECRET_KEY_FILE/,
    );
  });
});
