import { addSeconds, Existing, groupEvents, planBatch, planGroup } from './consolidation';
import { HeartbeatEvent } from './progress.events';

const T0 = 1_700_000_000_000;
const none = (): Existing => ({ ranges: new Map(), progress: new Map(), sessions: new Map() });

const hb = (over: Partial<HeartbeatEvent> & { pos: number; ts: number }): HeartbeatEvent => ({
  type: 'hb',
  tid: 't1',
  uid: 'u1',
  lid: 'l1',
  sid: 's1',
  dur: 100,
  rate: 1,
  from: -1,
  to: -1,
  ...over,
});

describe('planGroup', () => {
  it('une os trechos novos, calcula progresso e cria a sessão', () => {
    const plan = planGroup(
      [
        hb({ pos: 0, ts: T0 }),
        hb({ pos: 10, ts: T0 + 10_000, from: 0, to: 10, dev: 'web', q: '720p' }),
        hb({ pos: 20, ts: T0 + 20_000, from: 10, to: 20, dev: 'web', q: '720p' }),
      ],
      none(),
    );
    expect(plan.pairs).toEqual([{ tenantId: 't1', userId: 'u1', lessonId: 'l1' }]);
    expect(plan.ranges).toEqual([
      { tenantId: 't1', userId: 'u1', lessonId: 'l1', fromS: 0, toS: 20 },
    ]);
    expect(plan.progress[0]).toMatchObject({
      lastPos: 20,
      maxPos: 20,
      percent: 20,
      completedAt: null,
    });
    expect(plan.sessions[0]).toMatchObject({
      id: 's1',
      watchedS: 20,
      device: 'web',
      avgRate: 1,
      ratesS: { '1': 20 },
      qualitiesS: { '720p': 20 },
      endedAt: null,
    });
    expect(plan.sessions[0].startedAt.getTime()).toBe(T0);
    expect(plan.sessions[0].lastSeenAt.getTime()).toBe(T0 + 20_000);
  });

  it('soma ao que já existia (trechos, sessão e velocidades) sem contar duas vezes', () => {
    const ex = none();
    ex.ranges.set('u1|l1', [[0, 30]]);
    ex.progress.set('u1|l1', { maxPos: 30, completedAt: null });
    ex.sessions.set('s1', {
      watchedS: 30,
      avgRate: 1,
      lastSeenAt: new Date(T0),
      endedAt: null,
      ratesS: { '1': 30 },
      qualitiesS: { '720p': 30 },
    });
    const plan = planGroup(
      [hb({ pos: 50, ts: T0 + 5_000, from: 20, to: 50, rate: 2, q: '480p' })], // sobrepõe 20–30
      ex,
    );
    expect(plan.ranges.map((r) => [r.fromS, r.toS])).toEqual([[0, 50]]); // união, não 60
    expect(plan.progress[0]).toMatchObject({ maxPos: 50, percent: 50 });
    expect(plan.sessions[0].watchedS).toBe(60); // a sessão soma o que foi PERCORRIDO (30 + 30)
    expect(plan.sessions[0].ratesS).toEqual({ '1': 30, '2': 30 });
    expect(plan.sessions[0].qualitiesS).toEqual({ '720p': 30, '480p': 30 });
    expect(plan.sessions[0].avgRate).toBe(1.5); // (1×30 + 2×30) / 60
  });

  it('a conclusão acontece com 90% de cobertura e nunca é desfeita', () => {
    const done = planGroup([hb({ pos: 90, ts: T0, from: 0, to: 90 })], none());
    expect(done.progress[0].completedAt).toEqual(new Date(T0));

    const ex = none();
    const when = new Date(T0 - 1000);
    ex.ranges.set('u1|l1', [[0, 95]]);
    ex.progress.set('u1|l1', { maxPos: 95, completedAt: when });
    const again = planGroup([hb({ pos: 5, ts: T0 })], ex); // voltou ao começo para rever
    expect(again.progress[0]).toMatchObject({ lastPos: 5, maxPos: 95, completedAt: when });
  });

  it('evento "end" fecha a sessão; "end" sem nenhum heartbeat não cria sessão', () => {
    const end = (sid: string) => ({
      type: 'end' as const,
      tid: 't1',
      uid: 'u1',
      lid: 'l1',
      sid,
      ts: T0 + 9_000,
    });
    const closed = planGroup([hb({ pos: 4, ts: T0, from: 0, to: 4 }), end('s1')], none());
    expect(closed.sessions[0].endedAt).toEqual(new Date(T0 + 9_000));
    expect(planGroup([end('fantasma')], none()).sessions).toEqual([]);
  });

  it('end sobre sessão existente preserva os totais e só define o término', () => {
    const ex = none();
    ex.sessions.set('s1', {
      watchedS: 12,
      avgRate: 1.25,
      lastSeenAt: new Date(T0),
      endedAt: null,
      ratesS: { '1.25': 12 },
      qualitiesS: null,
    });
    const plan = planGroup(
      [{ type: 'end', tid: 't1', uid: 'u1', lid: 'l1', sid: 's1', ts: T0 + 3000 }],
      ex,
    );
    expect(plan.sessions[0]).toMatchObject({
      watchedS: 12,
      avgRate: 1.25,
      endedAt: new Date(T0 + 3000),
    });
    expect(plan.sessions[0].lastSeenAt).toEqual(new Date(T0));
    expect(plan.pairs).toEqual([]); // sem heartbeat não mexe nos trechos
  });

  it('pulo (from = -1) não gera trecho nem tempo, mas registra a posição', () => {
    const plan = planGroup([hb({ pos: 80, ts: T0 })], none());
    expect(plan.ranges).toEqual([]);
    expect(plan.progress[0]).toMatchObject({ lastPos: 80, maxPos: 80, percent: 0 });
    expect(plan.sessions[0]).toMatchObject({ watchedS: 0, avgRate: null });
  });
});

describe('planBatch / groupEvents', () => {
  it('separa por aluno/aula e consolida vários grupos de uma vez', () => {
    const events = [
      hb({ pos: 10, ts: T0, from: 0, to: 10 }),
      hb({ uid: 'u2', sid: 's2', pos: 5, ts: T0, from: 0, to: 5 }),
      hb({ lid: 'l2', sid: 's3', pos: 7, ts: T0, from: 0, to: 7 }),
    ];
    const groups = groupEvents(events);
    expect([...groups.keys()].sort()).toEqual(['u1|l1', 'u1|l2', 'u2|l1']);
    const plan = planBatch([...groups.values()], none());
    expect(plan.pairs).toHaveLength(3);
    expect(plan.sessions.map((s) => s.id).sort()).toEqual(['s1', 's2', 's3']);
    const percents = plan.progress.map((p) => p.percent).sort((a, b) => a - b);
    expect(percents.map((p) => Math.round(p * 100) / 100)).toEqual([5, 7, 10]); // tolera 7.000000000000001
  });
});

describe('addSeconds', () => {
  it('acumula por chave e ignora heartbeats sem trecho', () => {
    const hbs = [
      hb({ pos: 1, ts: T0, from: 0, to: 1 }),
      hb({ pos: 3, ts: T0, from: 1, to: 3 }),
      hb({ pos: 9, ts: T0 }), // sem trecho
    ];
    expect(addSeconds({ a: 2 }, hbs, () => 'a')).toEqual({ a: 5 });
    expect(addSeconds(null, hbs, (h) => String(h.pos))).toEqual({ '1': 1, '3': 2 });
  });
});
