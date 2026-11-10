import { TenantOriginsService } from './tenant-origins.service';

const make = (rows: { allowedDomains: string[] }[]) => {
  const calls = { n: 0 };
  const prisma = {
    tenant: {
      findMany: async () => {
        calls.n++;
        return rows;
      },
    },
  };
  return { svc: new TenantOriginsService(prisma as never), calls };
};

describe('TenantOriginsService', () => {
  it('junta e deduplica os domínios das empresas ativas', async () => {
    const { svc } = make([
      { allowedDomains: ['a.com', 'b.com'] },
      { allowedDomains: ['b.com'] },
      { allowedDomains: [] },
    ]);
    expect((await svc.hosts()).sort()).toEqual(['a.com', 'b.com']);
  });

  it('cacheia por 30 s (uma consulta ao banco para várias requisições) e reconsulta depois', async () => {
    const { svc, calls } = make([{ allowedDomains: ['a.com'] }]);
    const t0 = Date.now();
    await Promise.all([svc.hosts(t0), svc.hosts(t0), svc.hosts(t0)]); // concorrentes dividem a consulta
    await svc.hosts(t0 + 10_000);
    expect(calls.n).toBe(1);
    await svc.hosts(t0 + 31_000);
    expect(calls.n).toBe(2);
  });

  it('invalidate força nova leitura', async () => {
    const { svc, calls } = make([{ allowedDomains: ['a.com'] }]);
    await svc.hosts();
    svc.invalidate();
    await svc.hosts();
    expect(calls.n).toBe(2);
  });
});
