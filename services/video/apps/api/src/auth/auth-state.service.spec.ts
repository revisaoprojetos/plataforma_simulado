import { AUTH_STATE_DENY_TTL_S, AUTH_STATE_TTL_S, AuthStateService } from './auth-state.service';

class FakeRedis {
  store = new Map<string, { v: string; ex?: number }>();
  fail = false;
  get = async (k: string) => {
    if (this.fail) throw new Error('down');
    return this.store.get(k)?.v ?? null;
  };
  set = async (k: string, v: string, _mode: string, ex: number) => {
    this.store.set(k, { v, ex });
    return 'OK';
  };
  del = async (...keys: string[]) => {
    for (const k of keys) this.store.delete(k);
    return keys.length;
  };
}

const make = (row: unknown) => {
  const redis = new FakeRedis();
  const calls = { users: 0, refresh: 0 };
  const prisma = {
    user: {
      findUnique: async () => {
        calls.users++;
        return row;
      },
    },
    refreshToken: {
      updateMany: async () => {
        calls.refresh++;
        return { count: 1 };
      },
    },
  };
  return { svc: new AuthStateService(prisma as never, redis as never), redis, calls };
};

describe('AuthStateService', () => {
  it('usuário ativo de empresa ativa: ok, com cache de 20 s', async () => {
    const { svc, redis, calls } = make({
      deletedAt: null,
      role: 'aluno',
      tenant: { status: 'active' },
    });
    expect(await svc.get('u1')).toEqual({ ok: true, role: 'aluno' });
    await svc.get('u1');
    expect(calls.users).toBe(1); // a 2ª leitura veio do cache
    expect(redis.store.get('au:u1')?.ex).toBe(AUTH_STATE_TTL_S);
  });

  it('removido, inexistente ou empresa suspensa: negado, com cache curto (5 s)', async () => {
    for (const row of [
      { deletedAt: new Date(), role: 'aluno', tenant: { status: 'active' } },
      { deletedAt: null, role: 'aluno', tenant: { status: 'suspended' } },
      null,
    ]) {
      const { svc, redis } = make(row);
      expect((await svc.get('u1')).ok).toBe(false);
      expect(redis.store.get('au:u1')?.ex).toBe(AUTH_STATE_DENY_TTL_S);
    }
  });

  it('platform_admin (sem empresa) é ok enquanto ativo', async () => {
    const { svc } = make({ deletedAt: null, role: 'platform_admin', tenant: null });
    expect(await svc.get('p1')).toEqual({ ok: true, role: 'platform_admin' });
  });

  it('Redis fora do ar: consulta o banco direto (não bloqueia ninguém)', async () => {
    const { svc, redis } = make({ deletedAt: null, role: 'aluno', tenant: null });
    redis.fail = true;
    expect((await svc.get('u1')).ok).toBe(true);
  });

  it('revoke limpa estado + sessões de reprodução e, se pedido, os refresh tokens', async () => {
    const { svc, redis, calls } = make({ deletedAt: null, role: 'aluno', tenant: null });
    redis.store.set('au:u1', { v: '{}' });
    redis.store.set('ps:u1', { v: 'x' });
    await svc.revoke('u1', { refreshTokens: true });
    expect(redis.store.size).toBe(0);
    expect(calls.refresh).toBe(1);
    await svc.revoke('u1');
    expect(calls.refresh).toBe(1);
  });
});
