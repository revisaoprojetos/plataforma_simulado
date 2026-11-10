import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { CONFIG } from '../config/config.module';
import { Env } from '../config/env';

/** Contrato com o worker (apps/worker/src/queue.ts) — manter os dois lados iguais. */
export const TRANSCODE_QUEUE = 'transcode';
export interface TranscodeJob {
  videoId: string;
  tenantId: string;
}

/** Abstração para permitir fake nos testes. */
export abstract class TranscodeQueue {
  abstract enqueue(job: TranscodeJob): Promise<void>;
  /** Jobs por estado (waiting, active, delayed, failed) — alimenta a métrica de profundidade da fila. */
  abstract counts(): Promise<Record<string, number>>;
}

@Injectable()
export class BullTranscodeQueue extends TranscodeQueue implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<TranscodeJob>;

  constructor(@Inject(CONFIG) env: Env) {
    super();
    // BullMQ exige maxRetriesPerRequest = null na conexão.
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue<TranscodeJob>(TRANSCODE_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }

  async enqueue(job: TranscodeJob): Promise<void> {
    // jobId único por tentativa de processamento permite reprocessar o mesmo vídeo.
    await this.queue.add('transcode', job, { jobId: `${job.videoId}-${Date.now()}` });
  }

  async counts(): Promise<Record<string, number>> {
    return this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
