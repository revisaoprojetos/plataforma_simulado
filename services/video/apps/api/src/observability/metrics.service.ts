import { Inject, Injectable } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import Redis from 'ioredis';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { REDIS } from '../redis/redis.module';
import { EVENTS_KEY, queuePressure } from '../progress/progress.events';
import { TranscodeQueue } from '../queue/transcode.queue';

/**
 * Métricas no formato Prometheus. Rótulos têm cardinalidade controlada: rota é o *padrão*
 * (`/v1/lessons/:id/progress`), nunca a URL com ids; nada aqui carrega dados pessoais.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duração das requisições HTTP',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  /** result: accepted | ignored (duplicado/fora de ordem) | too_fast | queue_full */
  readonly heartbeats = new Counter({
    name: 'heartbeats_total',
    help: 'Heartbeats do player por resultado',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  readonly playbackStarted = new Counter({
    name: 'playback_sessions_started_total',
    help: 'Sessões de reprodução abertas',
    registers: [this.registry],
  });

  readonly rateLimited = new Counter({
    name: 'rate_limited_total',
    help: 'Requisições recusadas por limite, por política',
    labelNames: ['policy'] as const,
    registers: [this.registry],
  });

  readonly consolidatedEvents = new Counter({
    name: 'progress_events_consolidated_total',
    help: 'Eventos de progresso gravados no Postgres',
    registers: [this.registry],
  });

  readonly consolidationFailures = new Counter({
    name: 'progress_consolidation_failures_total',
    help: 'Lotes de progresso que falharam e voltaram para a fila',
    registers: [this.registry],
  });

  readonly consolidationDuration = new Histogram({
    name: 'progress_consolidation_duration_seconds',
    help: 'Duração de cada lote de consolidação',
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [this.registry],
  });

  constructor(
    @Inject(REDIS) redis: Redis,
    private readonly transcode: TranscodeQueue,
  ) {
    collectDefaultMetrics({ register: this.registry });

    // Gauges lidos na hora da coleta. Se a fila crescer sem parar, o consolidador está falhando.
    new Gauge({
      name: 'progress_events_queue_length',
      help: 'Heartbeats aguardando consolidação no Redis',
      registers: [this.registry],
      collect: async function (this: Gauge) {
        this.set(await redis.llen(EVENTS_KEY).catch(() => 0));
      },
    });
    new Gauge({
      name: 'progress_events_queue_ratio',
      help: 'Ocupação da fila de heartbeats (0 a 1, em relação ao teto)',
      registers: [this.registry],
      collect: async function (this: Gauge) {
        this.set(queuePressure(await redis.llen(EVENTS_KEY).catch(() => 0)).ratio);
      },
    });
    new Gauge({
      name: 'progress_events_queue_pressure',
      help: '1 quando a fila de heartbeats passou de 80% do teto (alerta); 0 caso contrário',
      registers: [this.registry],
      collect: async function (this: Gauge) {
        const { level } = queuePressure(await redis.llen(EVENTS_KEY).catch(() => 0));
        this.set(level === 'ok' ? 0 : 1);
      },
    });
    const transcodeJobs = new Gauge({
      name: 'transcode_queue_jobs',
      help: 'Jobs de transcodificação por estado',
      labelNames: ['state'] as const,
      registers: [this.registry],
      collect: async function (this: Gauge) {
        const counts = await transcode.counts().catch(() => ({}) as Record<string, number>);
        for (const [state, n] of Object.entries(counts)) transcodeJobs.set({ state }, n);
      },
    });
  }

  /**
   * Mede a duração de cada requisição, rotulando pelo padrão da rota (não pela URL com ids).
   * Registrado no início da aplicação (não como middleware de módulo) para também contar
   * rotas inexistentes — varreduras de URL aparecem agrupadas sob o curinga `/v1/*`.
   */
  middleware = (req: Request, res: Response, next: NextFunction): void => {
    const end = this.httpDuration.startTimer();
    res.on('finish', () =>
      end({
        method: req.method,
        route: req.route?.path ?? 'não_roteada',
        status: String(res.statusCode),
      }),
    );
    next();
  };

  async render(): Promise<{ contentType: string; body: string }> {
    return { contentType: this.registry.contentType, body: await this.registry.metrics() };
  }
}
