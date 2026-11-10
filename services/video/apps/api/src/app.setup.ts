import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppExceptionFilter } from './common/app-exception.filter';
import { correlationMiddleware } from './common/correlation';
import { Env } from './config/env';
import { MetricsService } from './observability/metrics.service';
import { corsAllows } from './playback/origin';
import { TenantOriginsService } from './playback/tenant-origins.service';

/** Configuração compartilhada entre o servidor e os testes e2e. */
export function configureApp(
  app: INestApplication,
  env?: Pick<Env, 'CORS_ORIGINS' | 'TRUST_PROXY'>,
): void {
  // Saúde e métricas ficam na raiz (sondas e Prometheus não conhecem /v1); o curinga cobre /health/live.
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/(.*)', 'metrics', 'mcp'] });
  app.enableShutdownHooks();
  const express = app as NestExpressApplication;

  // 1º: toda requisição ganha um X-Correlation-Id (logs e respostas de erro).
  app.use(correlationMiddleware);
  app.use(app.get(MetricsService).middleware);

  // API JSON: nada de scripts/embeds. O Swagger (/docs) precisa de scripts inline, então fica de fora.
  const secure = helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    // O player (outra origem) lê respostas via CORS; a política de recurso não pode bloquear isso.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  });
  app.use((req: { path: string }, res: unknown, next: () => void) =>
    req.path.startsWith('/docs') ? next() : (secure as (...a: unknown[]) => void)(req, res, next),
  );

  // O padrão do Express (100 kb) não comporta um arquivo de legenda (aceitamos até 2 MB).
  express.useBodyParser('json', { limit: '3mb' });
  app.useGlobalFilters(new AppExceptionFilter());

  if (env) {
    // IP real do cliente atrás de proxy reverso (limite de requisições, logs).
    express.set('trust proxy', env.TRUST_PROXY);
    // Quem pode ler a resposta no navegador: CORS_ORIGINS (fixas) + allowedDomains das empresas ativas
    // (cache curto). Origem desconhecida não recebe cabeçalhos CORS (o navegador bloqueia a leitura).
    // O controle real por empresa continua sendo allowedDomains no playback.
    const tenantOrigins = app.get(TenantOriginsService, { strict: false });
    app.enableCors({
      origin: (origin: string | undefined, cb: (e: Error | null, ok?: boolean) => void) => {
        if (!origin || env.CORS_ORIGINS.includes(origin)) return cb(null, true);
        tenantOrigins
          .hosts()
          .then((hosts) => cb(null, corsAllows(origin, env.CORS_ORIGINS, hosts)))
          .catch(() => cb(null, false));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      exposedHeaders: ['X-Correlation-Id', 'Retry-After'],
      maxAge: 600,
    });
  }
}
