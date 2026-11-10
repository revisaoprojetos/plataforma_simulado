import { Global, Inject, Injectable, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

/** Lista do Redis onde os heartbeats esperam a consolidação em lote no Postgres. */
export const EVENTS_KEY = 'progress:events';
/**
 * Teto de segurança: se o consolidador parar por muito tempo, descarta o excedente em vez de estourar a memória.
 *
 * Política (documentada): ao atingir o teto, heartbeats NOVOS são descartados (métrica
 * `heartbeats_total{result="queue_full"}`); o que já está na fila é preservado e processado em ordem.
 * Consequência: perdem-se segundos assistidos (trechos/estatísticas), nunca a aula nem o login. A 80% do
 * teto a métrica `progress_events_queue_pressure` vira 1 (alerta: consolidador parado/lento) — aja antes
 * de chegar a 100%: reiniciar/escalar o consolidador (ver docs/operacao.md).
 */
export const MAX_QUEUE_LENGTH = 500_000;
/** Fração do teto a partir da qual a fila é considerada sob pressão (alerta). */
export const QUEUE_WARN_RATIO = 0.8;

export type QueueLevel = 'ok' | 'warn' | 'full';

/** Situação da fila de heartbeats para métricas/alertas. */
export function queuePressure(
  length: number,
  max = MAX_QUEUE_LENGTH,
): { ratio: number; level: QueueLevel } {
  const ratio = max > 0 ? length / max : 0;
  const level: QueueLevel = ratio >= 1 ? 'full' : ratio >= QUEUE_WARN_RATIO ? 'warn' : 'ok';
  return { ratio, level };
}

export interface HeartbeatEvent {
  type: 'hb';
  tid: string;
  uid: string;
  lid: string;
  sid: string;
  /** duração do vídeo (s) */
  dur: number;
  /** posição atual (s) */
  pos: number;
  rate: number;
  /** momento do recebimento no servidor (ms) */
  ts: number;
  /** trecho realmente percorrido desde o heartbeat anterior; -1 quando não houve (início, pulo, pausa) */
  from: number;
  to: number;
  q?: string;
  dev?: string;
}

export interface EndEvent {
  type: 'end';
  tid: string;
  uid: string;
  lid: string;
  sid: string;
  ts: number;
}

export type ProgressEvent = HeartbeatEvent | EndEvent;

@Injectable()
export class ProgressEvents {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** O player encerrou a sessão (fechou a aba, terminou): fecha o registro de visualização. */
  async pushEnd(e: Omit<EndEvent, 'type' | 'ts'>, ts = Date.now()): Promise<void> {
    await this.redis.rpush(EVENTS_KEY, JSON.stringify({ type: 'end', ts, ...e }));
  }
}

/** Global para o módulo de playback poder registrar o fim da sessão sem depender do módulo de progresso. */
@Global()
@Module({ providers: [ProgressEvents], exports: [ProgressEvents] })
export class ProgressEventsModule {}
