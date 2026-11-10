import { EndEvent, HeartbeatEvent, ProgressEvent } from './progress.events';
import { isCompleted, mergeRanges, percentWatched, Range } from './ranges';

/** Estado já gravado no banco que o planejamento precisa conhecer. */
export interface Existing {
  /** `${userId}|${lessonId}` → trechos mesclados já gravados */
  ranges: Map<string, Range[]>;
  progress: Map<string, { maxPos: number; completedAt: Date | null }>;
  /** sessionId → sessão já gravada */
  sessions: Map<string, ExistingSession>;
}

export interface ExistingSession {
  watchedS: number;
  avgRate: number | null;
  lastSeenAt: Date;
  endedAt: Date | null;
  ratesS: Record<string, number> | null;
  qualitiesS: Record<string, number> | null;
}

export interface PlannedProgress {
  tenantId: string;
  userId: string;
  lessonId: string;
  lastPos: number;
  maxPos: number;
  percent: number;
  completedAt: Date | null;
}

export interface PlannedSession {
  id: string;
  tenantId: string;
  userId: string;
  lessonId: string;
  startedAt: Date;
  lastSeenAt: Date;
  endedAt: Date | null;
  watchedS: number;
  device: string | null;
  avgRate: number | null;
  ratesS: Record<string, number>;
  qualitiesS: Record<string, number>;
}

/** Tudo o que precisa ser gravado, com valores FINAIS (já somados ao que existia). */
export interface Plan {
  /** pares (aluno, aula) cujos trechos serão substituídos pelos de `ranges` */
  pairs: { tenantId: string; userId: string; lessonId: string }[];
  ranges: { tenantId: string; userId: string; lessonId: string; fromS: number; toS: number }[];
  progress: PlannedProgress[];
  sessions: PlannedSession[];
}

export const emptyPlan = (): Plan => ({ pairs: [], ranges: [], progress: [], sessions: [] });

export const pairKey = (userId: string, lessonId: string) => `${userId}|${lessonId}`;

/** Soma os segundos assistidos de cada heartbeat ao mapa existente, agrupando por `keyOf`. */
export function addSeconds(
  current: Record<string, number> | null | undefined,
  hbs: HeartbeatEvent[],
  keyOf: (h: HeartbeatEvent) => string,
): Record<string, number> {
  const out: Record<string, number> = { ...(current ?? {}) };
  for (const h of hbs) {
    if (h.from < 0) continue;
    const k = keyOf(h);
    out[k] = Math.round(((out[k] ?? 0) + (h.to - h.from)) * 1000) / 1000;
  }
  return out;
}

/**
 * Planeja a gravação dos eventos de UM par (aluno, aula): une os trechos novos aos existentes,
 * recalcula o progresso (a conclusão nunca é desfeita) e acumula as sessões de visualização.
 * Função pura: não toca em banco nem em relógio.
 */
export function planGroup(group: ProgressEvent[], existing: Existing): Plan {
  const plan = emptyPlan();
  const sorted = [...group].sort((a, b) => a.ts - b.ts);
  const hbs = sorted.filter((e): e is HeartbeatEvent => e.type === 'hb');
  const ends = sorted.filter((e): e is EndEvent => e.type === 'end');
  const { tid, uid, lid } = sorted[0];
  const key = pairKey(uid, lid);

  if (hbs.length > 0) {
    const last = hbs[hbs.length - 1];
    const dur = last.dur;
    const newRanges = hbs.filter((h) => h.from >= 0).map((h): Range => [h.from, h.to]);
    const merged = mergeRanges([...(existing.ranges.get(key) ?? []), ...newRanges], dur);

    plan.pairs.push({ tenantId: tid, userId: uid, lessonId: lid });
    for (const [fromS, toS] of merged) {
      plan.ranges.push({ tenantId: tid, userId: uid, lessonId: lid, fromS, toS });
    }

    const prev = existing.progress.get(key);
    plan.progress.push({
      tenantId: tid,
      userId: uid,
      lessonId: lid,
      lastPos: last.pos,
      maxPos: Math.max(prev?.maxPos ?? 0, ...hbs.map((h) => h.pos)),
      percent: percentWatched(merged, dur),
      completedAt: prev?.completedAt ?? (isCompleted(merged, dur) ? new Date(last.ts) : null),
    });
  }

  for (const sid of new Set(sorted.map((e) => e.sid))) {
    const sHbs = hbs.filter((h) => h.sid === sid);
    const end = ends.filter((e) => e.sid === sid).pop();
    const prev = existing.sessions.get(sid);
    if (!prev && sHbs.length === 0) continue; // fim sem nenhum heartbeat: nada a registrar

    const len = sHbs.reduce((s, h) => s + (h.from >= 0 ? h.to - h.from : 0), 0);
    const rateLen = sHbs.reduce((s, h) => s + (h.from >= 0 ? h.rate * (h.to - h.from) : 0), 0);
    const lastHb = sHbs[sHbs.length - 1];
    const device = [...sHbs].reverse().find((h) => h.dev)?.dev ?? null;
    const ratesS = addSeconds(prev?.ratesS, sHbs, (h) => String(Math.round(h.rate * 100) / 100));
    const qualitiesS = addSeconds(prev?.qualitiesS, sHbs, (h) => h.q ?? 'desconhecida');
    const total = (prev?.watchedS ?? 0) + len;
    const lastSeen = Math.max(prev?.lastSeenAt.getTime() ?? 0, lastHb?.ts ?? 0);

    plan.sessions.push({
      id: sid,
      tenantId: tid,
      userId: uid,
      lessonId: lid,
      startedAt: new Date(sHbs[0]?.ts ?? lastSeen),
      lastSeenAt: new Date(lastSeen),
      endedAt: end ? new Date(end.ts) : (prev?.endedAt ?? null),
      watchedS: total,
      device,
      avgRate: total > 0 ? ((prev?.avgRate ?? 0) * (prev?.watchedS ?? 0) + rateLen) / total : null,
      ratesS,
      qualitiesS,
    });
  }
  return plan;
}

/** Agrupa os eventos por (aluno, aula): a unidade de consistência da consolidação. */
export function groupEvents(events: ProgressEvent[]): Map<string, ProgressEvent[]> {
  const groups = new Map<string, ProgressEvent[]>();
  for (const e of events) {
    const k = pairKey(e.uid, e.lid);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(e);
  }
  return groups;
}

export function planBatch(groups: ProgressEvent[][], existing: Existing): Plan {
  const plan = emptyPlan();
  for (const g of groups) {
    const p = planGroup(g, existing);
    plan.pairs.push(...p.pairs);
    plan.ranges.push(...p.ranges);
    plan.progress.push(...p.progress);
    plan.sessions.push(...p.sessions);
  }
  return plan;
}
