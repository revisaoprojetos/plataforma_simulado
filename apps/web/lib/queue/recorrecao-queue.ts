import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import type { RecorrecaoJob } from '@/lib/simulado/recorrecao'

/**
 * Produtor da fila `re-correcao`. O web enfileira; o worker consome e chama de volta
 * /api/internal/recorrecao (que roda a MESMA lógica canônica de recorrecao.ts).
 * Singleton lazy (igual pdf-queue.ts): a conexão só abre no primeiro enfileiramento.
 */
let queue: Queue<RecorrecaoJob> | null = null
let connection: IORedis | null = null

export function getRecorrecaoQueue(): Queue<RecorrecaoJob> {
  if (queue) return queue
  connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null })
  queue = new Queue<RecorrecaoJob>('re-correcao', { connection })
  return queue
}

export async function enfileirarRecorrecao(data: RecorrecaoJob) {
  return getRecorrecaoQueue().add('processar', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  })
}
