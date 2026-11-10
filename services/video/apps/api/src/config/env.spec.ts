import { parseEnv } from './env';

const base = {
  S3_ENDPOINT: 'https://hel1.your-objectstorage.com',
  S3_REGION: 'hel1',
  S3_BUCKET: 'b',
  S3_ACCESS_KEY: 'a',
  S3_SECRET_KEY: 's',
  DATABASE_URL: 'postgresql://x',
  REDIS_URL: 'redis://x',
  JWT_ACCESS_SECRET: 'x'.repeat(16),
  JWT_REFRESH_SECRET: 'y'.repeat(16),
};

const prod = {
  ...base,
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'a8f3k2m9q1w7e5r4t6y0u2i8o3p5l1z9',
  JWT_REFRESH_SECRET: 'z1x3c5v7b9n2m4l6k8j0h2g4f6d8s0a1',
  CORS_ORIGINS: 'https://cursos.empresa.com',
  TRUST_PROXY: '1',
};

describe('parseEnv', () => {
  it('aplica defaults', () => {
    const env = parseEnv(base as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(3000);
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
    expect(env.RATE_LIMIT_ENABLED).toBe(true);
    expect(env.TRUST_PROXY).toBe(0);
    expect(env.MAX_TENANT_STORAGE_BYTES).toBe(0);
    expect(env.UPLOAD_EXPIRY_HOURS).toBe(48);
    expect(env.REPORT_CACHE_TTL_S).toBe(60);
    expect(env.SWAGGER_ENABLED).toBeUndefined();
  });

  it('falha listando variáveis ausentes sem vazar valores', () => {
    expect(() => parseEnv({ ...base, S3_BUCKET: '' } as NodeJS.ProcessEnv)).toThrow(/S3_BUCKET/);
  });
});

describe('parseEnv em produção', () => {
  const parse = (over: Record<string, string> = {}) =>
    parseEnv({ ...prod, ...over } as NodeJS.ProcessEnv);

  it('aceita uma configuração segura', () => {
    expect(parse().NODE_ENV).toBe('production');
  });

  it('recusa segredos curtos, de exemplo ou iguais', () => {
    expect(() => parse({ JWT_ACCESS_SECRET: 'x'.repeat(16) })).toThrow(/ao menos 32/);
    expect(() =>
      parse({ JWT_REFRESH_SECRET: 'troque-por-outro-segredo-longo-demais-123' }),
    ).toThrow(/valor de exemplo/);
    expect(() => parse({ JWT_REFRESH_SECRET: prod.JWT_ACCESS_SECRET })).toThrow(/diferentes/);
  });

  it('exige TRUST_PROXY >= 1 atrás de proxy (padrão); TRUST_PROXY_REQUIRED=false é a saída consciente', () => {
    expect(() => parse({ TRUST_PROXY: '0' })).toThrow(/TRUST_PROXY deve ser >= 1/);
    expect(() => parse({ TRUST_PROXY: undefined as unknown as string })).toThrow(/TRUST_PROXY/);
    expect(parse({ TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
    expect(parse({ TRUST_PROXY: '0', TRUST_PROXY_REQUIRED: 'false' }).TRUST_PROXY).toBe(0);
  });

  it('fora de produção TRUST_PROXY=0 é aceito (padrão de desenvolvimento)', () => {
    expect(parseEnv(base as NodeJS.ProcessEnv).TRUST_PROXY_REQUIRED).toBe(true);
    expect(() => parseEnv({ ...base, TRUST_PROXY: '0' } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it('recusa limite de requisições desligado e CORS em localhost', () => {
    expect(() => parse({ RATE_LIMIT_ENABLED: 'false' })).toThrow(/RATE_LIMIT_ENABLED/);
    expect(() => parse({ CORS_ORIGINS: 'http://localhost:5173' })).toThrow(/CORS_ORIGINS/);
  });

  it('lista todos os problemas de uma vez', () => {
    expect(() =>
      parse({
        RATE_LIMIT_ENABLED: 'false',
        CORS_ORIGINS: 'http://localhost:1',
        JWT_ACCESS_SECRET: 'x'.repeat(32),
      }),
    ).toThrow(/RATE_LIMIT_ENABLED[\s\S]*CORS_ORIGINS/);
  });

  it('fora de produção as regras não se aplicam', () => {
    expect(() =>
      parseEnv({ ...base, RATE_LIMIT_ENABLED: 'false' } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
