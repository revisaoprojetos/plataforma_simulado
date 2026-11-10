import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Logger } from 'nestjs-pino';
import { parseEnv } from './config/env';
import { ConsolidatorModule } from './consolidator.module';
import { MetricsService } from './observability/metrics.service';

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Processo dedicado que esvazia a fila de heartbeats do Redis e grava no Postgres.
 * Rode em UMA instância (ou mais: as travas por aluno/aula tornam várias seguras) e deixe as
 * instâncias da API com PROGRESS_FLUSH_INTERVAL_MS=0. Expõe /health e /metrics em CONSOLIDATOR_PORT.
 */
async function main(): Promise<void> {
  const env = parseEnv();
  const app = await NestFactory.createApplicationContext(ConsolidatorModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks(); // ao encerrar, o consolidador esvazia a fila (onModuleDestroy)

  const metrics = app.get(MetricsService);
  const server = createServer((req, res) => {
    void (async () => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}');
      } else if (req.url === '/metrics' && env.METRICS_TOKEN) {
        const auth = req.headers.authorization ?? '';
        if (!auth.startsWith('Bearer ') || !same(auth.slice(7), env.METRICS_TOKEN)) {
          res.writeHead(401).end('unauthorized');
          return;
        }
        const m = await metrics.render();
        res
          .writeHead(200, { 'Content-Type': m.contentType, 'Cache-Control': 'no-store' })
          .end(m.body);
      } else {
        res.writeHead(404).end('not found');
      }
    })();
  });
  server.listen(env.CONSOLIDATOR_PORT, '0.0.0.0');
  app.get(Logger).log(`consolidador pronto (intervalo ${env.PROGRESS_FLUSH_INTERVAL_MS} ms)`);
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
