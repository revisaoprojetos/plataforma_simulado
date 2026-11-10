import { readFileSync } from 'node:fs';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const HOUR = 3600 * 1000;

const schema = z
  .object({
    S3_ENDPOINT: z.string().url(),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: bool,

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),

    /** Porta do /health e /metrics do worker. */
    METRICS_PORT: z.coerce.number().int().positive().default(9100),
    METRICS_TOKEN: z.string().min(16).optional(),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(1),
    FFMPEG_BIN: z.string().default('ffmpeg'),
    FFPROBE_BIN: z.string().default('ffprobe'),
    FFMPEG_PRESET: z.string().default('veryfast'),
    /** Threads do x264 por processo ffmpeg. 0 = o ffmpeg decide (usa todos os núcleos visíveis). */
    FFMPEG_THREADS: z.coerce.number().int().min(0).max(64).default(0),

    /** Tempo máximo do JOB INTEIRO (download + todas as qualidades + upload). */
    JOB_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
    /** Legado: antes era por comando do ffmpeg. Se JOB_TIMEOUT_MS não existir, vale como tempo do job. */
    FFMPEG_TIMEOUT_MS: z.coerce.number().int().positive().optional(),

    /** BullMQ: o worker renova o lock a cada metade disto; sem renovar, o job é dado como "stalled". */
    WORKER_LOCK_DURATION_MS: z.coerce.number().int().min(10_000).default(60_000),
    /** BullMQ: de quanto em quanto tempo procurar jobs "stalled" (precisa ser >= lock/2). */
    WORKER_STALLED_INTERVAL_MS: z.coerce.number().int().min(5_000).default(30_000),
    WORKER_MAX_STALLED_COUNT: z.coerce.number().int().min(0).max(10).default(2),

    /** No SIGTERM: quanto esperar jobs em andamento terminarem sozinhos antes de cancelar e devolver à fila. */
    SHUTDOWN_DRAIN_MS: z.coerce.number().int().min(0).default(20_000),

    /** Pasta de trabalho (originais + saída HLS). Padrão: o tmp do sistema (volume no Swarm). */
    WORK_DIR: z.string().min(1).optional(),
    /** Espaço livre mínimo que deve sobrar depois de reservar o job. */
    MIN_FREE_DISK_BYTES: z.coerce
      .number()
      .int()
      .min(0)
      .default(2 * 1024 ** 3),
    /** Quantas vezes o tamanho do original precisa caber em disco (original + saída + folga). */
    DISK_SPACE_FACTOR: z.coerce.number().min(1).default(2.5),
  })
  .transform((v) => ({
    ...v,
    JOB_TIMEOUT_MS: v.JOB_TIMEOUT_MS ?? v.FFMPEG_TIMEOUT_MS ?? 3 * HOUR,
  }));

export type Env = z.infer<typeof schema>;

/** Variáveis que também podem vir de um arquivo (Docker/Swarm secrets): `NOME_FILE=/run/secrets/nome`. */
export const FILE_SECRET_KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'METRICS_TOKEN',
] as const;

/**
 * Para cada `X_FILE` definido, lê o arquivo e grava o conteúdo (sem espaços/quebra final) em `X`.
 * Não sobrescreve um `X` já definido. Muta `raw` (o Prisma lê DATABASE_URL de process.env).
 */
export function applyFileSecrets(raw: NodeJS.ProcessEnv = process.env): void {
  for (const key of FILE_SECRET_KEYS) {
    const path = raw[`${key}_FILE`];
    if (!path || raw[key]) continue;
    try {
      raw[key] = readFileSync(path, 'utf8').trim();
    } catch (e) {
      throw new Error(`não foi possível ler ${key}_FILE (${path}): ${(e as Error).message}`);
    }
  }
}

export function parseEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  applyFileSecrets(raw);
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Configuração inválida:\n  ${issues}`);
  }
  return result.data;
}
