import { Period } from './period';
import { AnalyticsService } from './analytics.service';

class FakeRedis {
  store = new Map<string, string>();
  gets = 0;
  get = async (k: string) => {
    this.gets++;
    return this.store.get(k) ?? null;
  };
  set = async (k: string, v: string) => {
    this.store.set(k, v);
    return 'OK';
  };
}

type Cached = (
  kind: 'lesson' | 'course',
  tenantId: string,
  id: string,
  period: Period,
  compute: () => Promise<unknown>,
) => Promise<unknown>;

const make = (ttl: number) => {
  const redis = new FakeRedis();
  const svc = new AnalyticsService({} as never, {} as never, redis as never, {
    REPORT_CACHE_TTL_S: ttl,
  });
  const fn = (svc as unknown as { cached: Cached }).cached.bind(svc);
  const cached = (id: string, from: number, to: number, compute: () => Promise<unknown>) =>
    fn('lesson', 't1', id, { from: new Date(from), to: new Date(to) }, compute);
  return { redis, cached };
};

describe('cache dos relatórios (1.7)', () => {
  it('a 2ª chamada no mesmo minuto vem do Redis (não recalcula)', async () => {
    const { cached } = make(60);
    let n = 0;
    const compute = async () => ({ n: ++n });
    const t = Date.UTC(2026, 10, 10, 12, 0, 10);
    expect(await cached('l1', t - 86_400_000, t, compute)).toEqual({ n: 1 });
    // "agora" andou 20 s (período padrão "até agora"): mesma chave por causa do arredondamento
    expect(await cached('l1', t - 86_400_000 + 20_000, t + 20_000, compute)).toEqual({ n: 1 });
    expect(n).toBe(1);
  });

  it('aulas diferentes não compartilham resultado; minuto novo recalcula', async () => {
    const { cached } = make(60);
    let n = 0;
    const compute = async () => ({ n: ++n });
    const t = Date.UTC(2026, 10, 10, 12, 0, 10);
    await cached('l1', t - 1000, t, compute);
    await cached('l2', t - 1000, t, compute);
    await cached('l1', t + 120_000 - 1000, t + 120_000, compute);
    expect(n).toBe(3);
  });

  it('TTL 0 desliga o cache (nem toca no Redis)', async () => {
    const { cached, redis } = make(0);
    let n = 0;
    await cached('l1', 0, 1000, async () => ++n);
    await cached('l1', 0, 1000, async () => ++n);
    expect(n).toBe(2);
    expect(redis.gets).toBe(0);
  });
});
