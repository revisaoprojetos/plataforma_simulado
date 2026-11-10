import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { CONFIG } from '../config/config.module';
import { Env } from '../config/env';
import { MetricsService } from '../observability/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { Existing, ExistingSession, groupEvents, pairKey, Plan, planBatch } from './consolidation';
import { EVENTS_KEY, ProgressEvent } from './progress.events';
import { Range } from './ranges';

const BATCH = 2000;
const MAX_BATCHES_PER_FLUSH = 100;
/** Sessão sem sinal de vida há mais que isto é considerada encerrada (fechou a aba sem avisar). */
const IDLE_SESSION_MS = 2 * 60 * 1000;
const SWEEP_EVERY_MS = 30 * 1000;
const TX = { timeout: 60_000, maxWait: 10_000 };

type Tx = Prisma.TransactionClient;

/** Violação de chave estrangeira (aula/usuário apagados): nunca vai se resolver sozinha. */
function isForeignKeyViolation(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  // P2003/P2025 pelo cliente; consultas cruas voltam como P2010 com o código 23503 do Postgres.
  return (
    e.code === 'P2003' ||
    e.code === 'P2025' ||
    (e.code === 'P2010' && String((e.meta as { code?: string } | undefined)?.code) === '23503')
  );
}

/**
 * Esvazia a fila de heartbeats do Redis e grava em lote no Postgres:
 * trechos assistidos (mesclados), progresso por aula e sessões de visualização.
 *
 * Caminho rápido: UM lote inteiro por transação, com SQL por conjuntos (~12 consultas, qualquer que
 * seja o número de eventos). Se algo falhar, reprocessa grupo a grupo para isolar o evento problemático:
 * o que referencia aula/aluno removido é descartado; o resto volta para a fila.
 *
 * Garantia: pelo menos uma vez para falhas tratadas, no máximo uma se o processo morrer entre retirar
 * e gravar — aceitável para métricas de estudo (perde segundos, não a aula).
 */
@Injectable()
export class ProgressConsolidator implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ProgressConsolidator.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private lastSweep = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CONFIG) private readonly env: Env,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    if (this.env.PROGRESS_FLUSH_INTERVAL_MS > 0) {
      this.timer = setInterval(() => {
        this.flush().catch((e: Error) => this.log.error(`flush falhou: ${e.message}`));
      }, this.env.PROGRESS_FLUSH_INTERVAL_MS);
      this.timer.unref();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush().catch(() => undefined);
  }

  /** Chamadas simultâneas compartilham a mesma execução. */
  flush(): Promise<void> {
    this.running ??= this.doFlush().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async doFlush(): Promise<void> {
    for (let i = 0; i < MAX_BATCHES_PER_FLUSH; i++) {
      const raw = await this.redis.lpop(EVENTS_KEY, BATCH);
      if (!raw?.length) break;
      const events = raw.map((r) => JSON.parse(r) as ProgressEvent);
      const stop = this.metrics.consolidationDuration.startTimer();
      const failed = await this.processBatch(events);
      stop();
      this.metrics.consolidatedEvents.inc(events.length - failed.length);
      if (failed.length) {
        this.metrics.consolidationFailures.inc();
        // Devolve ao início da fila preservando a ordem e tenta de novo no próximo ciclo.
        await this.redis.lpush(EVENTS_KEY, ...failed.map((e) => JSON.stringify(e)).reverse());
        break;
      }
    }
    if (Date.now() - this.lastSweep > SWEEP_EVERY_MS) {
      this.lastSweep = Date.now();
      await this.sweepIdleSessions();
    }
  }

  /** Devolve os eventos que falharam por motivo transitório (os permanentes são descartados). */
  private async processBatch(events: ProgressEvent[]): Promise<ProgressEvent[]> {
    const groups = [...groupEvents(events).values()];
    try {
      await this.consolidate(groups);
      return [];
    } catch (e) {
      this.log.warn(`lote falhou (${(e as Error).message.slice(0, 120)}); isolando por aluno/aula`);
    }
    const failed: ProgressEvent[] = [];
    for (const group of groups) {
      try {
        await this.consolidate([group]);
      } catch (e) {
        if (isForeignKeyViolation(e)) {
          this.log.warn(`descartando ${group.length} evento(s) de aula/aluno removido`);
        } else {
          this.log.error(`falha ao consolidar: ${(e as Error).message}`);
          failed.push(...group);
        }
      }
    }
    return failed;
  }

  /** Uma transação: trava os pares, lê o que já existe, planeja em memória e grava por conjuntos. */
  private async consolidate(groups: ProgressEvent[][]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Serializa consolidações concorrentes (várias réplicas) dos mesmos pares aluno/aula.
      // Ordem fixa evita deadlock entre duas consolidações com pares em comum.
      const keys = groups.map((g) => pairKey(g[0].uid, g[0].lid)).sort();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(t.k)) FROM unnest(${keys}::text[]) AS t(k)`;

      const existing = await this.loadExisting(tx, groups);
      await this.persist(tx, planBatch(groups, existing));
    }, TX);
  }

  private async loadExisting(tx: Tx, groups: ProgressEvent[][]): Promise<Existing> {
    const uids = groups.map((g) => g[0].uid);
    const lids = groups.map((g) => g[0].lid);
    const sids = [...new Set(groups.flat().map((e) => e.sid))];

    const [ranges, progress, sessions] = await Promise.all([
      tx.$queryRaw<{ user_id: string; lesson_id: string; from_s: number; to_s: number }[]>`
        SELECT user_id, lesson_id, from_s, to_s FROM watch_ranges
        WHERE (user_id, lesson_id) IN (SELECT * FROM unnest(${uids}::text[], ${lids}::text[]))`,
      tx.$queryRaw<
        { user_id: string; lesson_id: string; max_pos: number; completed_at: Date | null }[]
      >`
        SELECT user_id, lesson_id, max_pos, completed_at FROM lesson_progress
        WHERE (user_id, lesson_id) IN (SELECT * FROM unnest(${uids}::text[], ${lids}::text[]))`,
      tx.watchSession.findMany({ where: { id: { in: sids } } }),
    ]);

    const existing: Existing = { ranges: new Map(), progress: new Map(), sessions: new Map() };
    for (const r of ranges) {
      const k = pairKey(r.user_id, r.lesson_id);
      (existing.ranges.get(k) ?? existing.ranges.set(k, []).get(k)!).push([
        r.from_s,
        r.to_s,
      ] as Range);
    }
    for (const p of progress) {
      existing.progress.set(pairKey(p.user_id, p.lesson_id), {
        maxPos: p.max_pos,
        completedAt: p.completed_at,
      });
    }
    for (const s of sessions) {
      existing.sessions.set(s.id, {
        watchedS: s.watchedS,
        avgRate: s.avgRate,
        lastSeenAt: s.lastSeenAt,
        endedAt: s.endedAt,
        ratesS: s.ratesS as ExistingSession['ratesS'],
        qualitiesS: s.qualitiesS as ExistingSession['qualitiesS'],
      });
    }
    return existing;
  }

  /**
   * Grava o plano com SQL por conjuntos (`unnest`): o custo é o mesmo para 10 ou 10.000 eventos.
   * Campos opcionais viajam como '' / -1 e voltam a NULL no banco.
   */
  private async persist(tx: Tx, plan: Plan): Promise<void> {
    const iso = (d: Date | null) => (d ? d.toISOString() : '');
    // O Prisma envia array só de inteiros como int8[] (binário), que não casa com float8[]; texto serve para os dois.
    const nums = (xs: number[]) => xs.map(String);

    if (plan.pairs.length) {
      const uids = plan.pairs.map((p) => p.userId);
      const lids = plan.pairs.map((p) => p.lessonId);
      await tx.$executeRaw`
        DELETE FROM watch_ranges
        WHERE (user_id, lesson_id) IN (SELECT * FROM unnest(${uids}::text[], ${lids}::text[]))`;
    }
    if (plan.ranges.length) {
      const r = plan.ranges;
      await tx.$executeRaw`
        INSERT INTO watch_ranges (id, tenant_id, user_id, lesson_id, from_s, to_s)
        SELECT gen_random_uuid()::text, * FROM unnest(
          ${r.map((x) => x.tenantId)}::text[], ${r.map((x) => x.userId)}::text[],
          ${r.map((x) => x.lessonId)}::text[], ${nums(r.map((x) => x.fromS))}::text[]::float8[],
          ${nums(r.map((x) => x.toS))}::text[]::float8[])`;
    }
    if (plan.progress.length) {
      const p = plan.progress;
      await tx.$executeRaw`
        INSERT INTO lesson_progress
          (tenant_id, user_id, lesson_id, last_pos, max_pos, percent, completed_at, updated_at)
        SELECT v.tenant_id, v.user_id, v.lesson_id, v.last_pos, v.max_pos, v.percent,
               NULLIF(v.completed_at, '')::timestamp, (now() AT TIME ZONE 'UTC')
        FROM unnest(
          ${p.map((x) => x.tenantId)}::text[], ${p.map((x) => x.userId)}::text[],
          ${p.map((x) => x.lessonId)}::text[], ${nums(p.map((x) => x.lastPos))}::text[]::float8[],
          ${nums(p.map((x) => x.maxPos))}::text[]::float8[], ${nums(p.map((x) => x.percent))}::text[]::float8[],
          ${p.map((x) => iso(x.completedAt))}::text[]
        ) AS v(tenant_id, user_id, lesson_id, last_pos, max_pos, percent, completed_at)
        ON CONFLICT (user_id, lesson_id) DO UPDATE SET
          last_pos = EXCLUDED.last_pos, max_pos = EXCLUDED.max_pos, percent = EXCLUDED.percent,
          completed_at = COALESCE(lesson_progress.completed_at, EXCLUDED.completed_at),
          updated_at = (now() AT TIME ZONE 'UTC')`;
    }
    if (plan.sessions.length) {
      const s = plan.sessions;
      await tx.$executeRaw`
        INSERT INTO watch_sessions
          (id, tenant_id, user_id, lesson_id, started_at, last_seen_at, ended_at, watched_s,
           device, avg_rate, rates_s, qualities_s)
        SELECT v.id, v.tenant_id, v.user_id, v.lesson_id, v.started_at::timestamp,
               v.last_seen_at::timestamp, NULLIF(v.ended_at, '')::timestamp, v.watched_s,
               NULLIF(v.device, ''), NULLIF(v.avg_rate, -1), v.rates_s::jsonb, v.qualities_s::jsonb
        FROM unnest(
          ${s.map((x) => x.id)}::text[], ${s.map((x) => x.tenantId)}::text[],
          ${s.map((x) => x.userId)}::text[], ${s.map((x) => x.lessonId)}::text[],
          ${s.map((x) => iso(x.startedAt))}::text[], ${s.map((x) => iso(x.lastSeenAt))}::text[],
          ${s.map((x) => iso(x.endedAt))}::text[], ${nums(s.map((x) => x.watchedS))}::text[]::float8[],
          ${s.map((x) => x.device ?? '')}::text[], ${nums(s.map((x) => x.avgRate ?? -1))}::text[]::float8[],
          ${s.map((x) => JSON.stringify(x.ratesS))}::text[],
          ${s.map((x) => JSON.stringify(x.qualitiesS))}::text[]
        ) AS v(id, tenant_id, user_id, lesson_id, started_at, last_seen_at, ended_at, watched_s,
               device, avg_rate, rates_s, qualities_s)
        ON CONFLICT (id) DO UPDATE SET
          last_seen_at = EXCLUDED.last_seen_at,
          ended_at = COALESCE(EXCLUDED.ended_at, watch_sessions.ended_at),
          watched_s = EXCLUDED.watched_s,
          device = COALESCE(EXCLUDED.device, watch_sessions.device),
          avg_rate = EXCLUDED.avg_rate, rates_s = EXCLUDED.rates_s,
          qualities_s = EXCLUDED.qualities_s`;
    }
  }

  /** Fecha sessões abandonadas (aba fechada sem `end`) usando o último sinal de vida como fim. */
  private async sweepIdleSessions(): Promise<void> {
    const cutoff = new Date(Date.now() - IDLE_SESSION_MS);
    await this.prisma.$executeRaw`
      UPDATE watch_sessions SET ended_at = last_seen_at
      WHERE ended_at IS NULL AND last_seen_at < ${cutoff}`;
  }
}
