import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

/** Booleano com padrão verdadeiro (ex.: limite de requisições ligado a menos que se desligue). */
const boolOn = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: bool,

  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 ** 3),

  /** Cota de armazenamento de vídeos por empresa (soma dos originais declarados). 0/ausente = sem cota. */
  MAX_TENANT_STORAGE_BYTES: z.coerce.number().int().min(0).default(0),
  /** Upload multipart sem finalizar há mais que isto (horas) é abortado e apagado. */
  UPLOAD_EXPIRY_HOURS: z.coerce.number().int().min(1).max(720).default(48),

  /** Intervalo da varredura de uploads abandonados (ms); 0 desliga. */
  UPLOAD_SWEEP_INTERVAL_MS: z.coerce.number().int().min(0).default(3_600_000),

  /** Cache (s) dos relatórios por aula/curso; 0 desliga. Consistência eventual dos relatórios: ~5 s do consolidador + este TTL. */
  REPORT_CACHE_TTL_S: z.coerce.number().int().min(0).max(3600).default(60),

  // Playback seguro
  PLAYBACK_TOKEN_TTL: z.string().default('5m'),
  HLS_SEGMENT_URL_TTL: z.string().default('1h'),
  MAX_CONCURRENT_STREAMS: z.coerce.number().int().min(1).max(500).default(2),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),

  // Consolidação dos heartbeats no Postgres (ms); 0 desliga o timer (testes chamam flush() direto)
  PROGRESS_FLUSH_INTERVAL_MS: z.coerce.number().int().min(0).default(5000),

  /** Porta do /health e /metrics do processo consolidador (consolidator.main.js). */
  CONSOLIDATOR_PORT: z.coerce.number().int().positive().default(9102),

  // Segurança e operação
  RATE_LIMIT_ENABLED: boolOn,
  /** Quantos proxies confiáveis existem à frente da API (para o IP real em `req.ip`). 0 = nenhum. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  /**
   * Prefixo de caminho em que a API é exposta ao navegador quando o proxy a publica sob o domínio de outra
   * aplicação (ex.: `/video-api`, com stripprefix no Traefik). Só afeta a URL da chave AES gravada DENTRO do
   * manifesto (caminho absoluto, que o navegador resolve contra a origem). Vazio = API na raiz do host.
   */
  PUBLIC_PATH_PREFIX: z
    .string()
    .trim()
    .regex(/^(\/[a-z0-9._-]+)*$/i, 'use caminho como /video-api (sem barra final)')
    .default(''),
  /**
   * Em produção a API precisa estar atrás de proxy (Traefik/nginx): sem TRUST_PROXY>=1 todo cliente
   * parece ter o IP do proxy e o limite por IP/lockout vira um limite global. Valor recomendado: 1.
   * Com true (padrão), TRUST_PROXY=0 derruba o boot em produção; false só para ambientes sem proxy.
   */
  TRUST_PROXY_REQUIRED: boolOn,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Token (Bearer) para o Prometheus ler /metrics. Vazio = /metrics desligado (404). */
  METRICS_TOKEN: z.string().min(16).optional(),
  /**
   * Liga a API de integração (matrícula genérica e sessão do aluno para sistemas externos).
   * Desligada, as rotas respondem 404 como se não existissem; cada empresa ainda precisa ser
   * habilitada pelo operador da plataforma.
   */
  ACCESS_ENDPOINT_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Swagger em /docs. Padrão: ligado fora de produção. */
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
});

export type Env = z.infer<typeof envSchema>;

const PLACEHOLDER = /troque|changeme|example|secret-0123|test-/i;

/**
 * Em produção, recusa subir com configuração perigosa: segredos fracos ou de exemplo, os dois
 * segredos iguais, limite de requisições desligado ou CORS apontando para localhost.
 */
export function assertProductionSafe(env: Env): void {
  if (env.NODE_ENV !== 'production') return;
  const problems: string[] = [];
  for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (env[k].length < 32) problems.push(`${k} precisa ter ao menos 32 caracteres`);
    if (PLACEHOLDER.test(env[k])) problems.push(`${k} parece um valor de exemplo`);
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    problems.push('JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devem ser diferentes');
  }
  if (!env.RATE_LIMIT_ENABLED) problems.push('RATE_LIMIT_ENABLED não pode ser false em produção');
  if (env.TRUST_PROXY_REQUIRED && env.TRUST_PROXY < 1) {
    problems.push(
      'TRUST_PROXY deve ser >= 1 em produção (use 1 atrás do Traefik/nginx; ou TRUST_PROXY_REQUIRED=false sem proxy)',
    );
  }
  if (env.CORS_ORIGINS.some((o) => /localhost|127\.0\.0\.1/.test(o))) {
    problems.push('CORS_ORIGINS não pode apontar para localhost em produção');
  }
  if (problems.length) {
    throw new Error(`Configuração insegura para produção:\n  - ${problems.join('\n  - ')}`);
  }
}

export function parseEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n  ');
    throw new Error(`Configuração inválida:\n  ${missing}`);
  }
  assertProductionSafe(result.data);
  return result.data;
}
