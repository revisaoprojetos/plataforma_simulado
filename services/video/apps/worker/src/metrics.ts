import { createServer, Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

export interface HttpResult {
  status: number;
  contentType: string;
  body: string;
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Métricas do worker e um mini servidor HTTP: `/health` (liveness) e `/metrics` (Prometheus).
 * `/metrics` exige `Authorization: Bearer <METRICS_TOKEN>`; sem token configurado, retorna 404.
 */
export class WorkerMetrics {
  readonly registry = new Registry();

  readonly jobs = new Counter({
    name: 'transcode_jobs_total',
    help: 'Jobs de transcodificação finalizados',
    labelNames: ['status'] as const, // completed | failed | requeued (SIGTERM) | timeout
    registers: [this.registry],
  });

  readonly duration = new Histogram({
    name: 'transcode_duration_seconds',
    help: 'Duração de cada job de transcodificação',
    buckets: [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600],
    registers: [this.registry],
  });

  readonly active = new Gauge({
    name: 'transcode_jobs_active',
    help: 'Jobs em processamento agora neste worker',
    registers: [this.registry],
  });

  readonly workDirFree = new Gauge({
    name: 'transcode_workdir_free_bytes',
    help: 'Espaço livre na pasta de trabalho do worker (originais e saída HLS)',
    registers: [this.registry],
  });

  readonly workDirTotal = new Gauge({
    name: 'transcode_workdir_total_bytes',
    help: 'Tamanho total do disco da pasta de trabalho do worker',
    registers: [this.registry],
  });

  constructor(private readonly token?: string) {
    collectDefaultMetrics({ register: this.registry });
  }

  /** Roteamento puro (testável sem abrir porta). */
  async handle(url: string, authorization?: string): Promise<HttpResult> {
    if (url === '/health')
      return { status: 200, contentType: 'application/json', body: '{"status":"ok"}' };
    if (url === '/metrics') {
      if (!this.token) return { status: 404, contentType: 'text/plain', body: 'not found' };
      if (!authorization?.startsWith('Bearer ') || !same(authorization.slice(7), this.token)) {
        return { status: 401, contentType: 'text/plain', body: 'unauthorized' };
      }
      return {
        status: 200,
        contentType: this.registry.contentType,
        body: await this.registry.metrics(),
      };
    }
    return { status: 404, contentType: 'text/plain', body: 'not found' };
  }

  listen(port: number): Server {
    const server = createServer((req, res) => {
      void this.handle(req.url ?? '/', req.headers.authorization).then((r) => {
        res.writeHead(r.status, { 'Content-Type': r.contentType, 'Cache-Control': 'no-store' });
        res.end(r.body);
      });
    });
    server.listen(port, '0.0.0.0');
    return server;
  }
}
