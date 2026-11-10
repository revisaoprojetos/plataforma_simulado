import { ServiceUnavailableException } from '@nestjs/common';
import { TooManyRequestsException } from '../common/app-exception.filter';
import { FAIL_CLOSED, POLICIES, RateLimitService } from './rate-limit.service';

/** Redis falso: contador em memória com a mesma resposta do script Lua. */
class FakeRedis {
  counts = new Map<string, number>();
  fail = false;
  eval = async (_script: string, _n: number, key: string, windowMs: number) => {
    if (this.fail) throw new Error('conexão recusada');
    const c = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, c);
    return [c, windowMs];
  };
  evalsha = (_sha: string, n: number, key: string, windowMs: number) =>
    this.eval('', n, key, windowMs);
  del = async (key: string) => {
    this.counts.delete(key);
    return 1;
  };
}

const make = (enabled = true) => {
  const redis = new FakeRedis();
  return { redis, svc: new RateLimitService(redis as never, { RATE_LIMIT_ENABLED: enabled }) };
};

describe('RateLimitService', () => {
  it('libera até o limite e bloqueia a partir da requisição seguinte', async () => {
    const { svc } = make();
    const { limit } = POLICIES.loginAccount;
    for (let i = 0; i < limit; i++) expect((await svc.hit('loginAccount', 'a')).allowed).toBe(true);
    const over = await svc.hit('loginAccount', 'a');
    expect(over.allowed).toBe(false);
    expect(over.retryAfterS).toBe(POLICIES.loginAccount.windowS);
  });

  it('chaves e políticas são independentes', async () => {
    const { svc } = make();
    for (let i = 0; i < POLICIES.loginAccount.limit + 1; i++) await svc.hit('loginAccount', 'a');
    expect((await svc.hit('loginAccount', 'b')).allowed).toBe(true);
    expect((await svc.hit('loginIp', 'a')).allowed).toBe(true);
  });

  it('enforce lança 429 com o tempo de espera', async () => {
    const { svc } = make();
    for (let i = 0; i < POLICIES.privacy.limit; i++) await svc.enforce('privacy', 'u');
    await expect(svc.enforce('privacy', 'u')).rejects.toBeInstanceOf(TooManyRequestsException);
    await expect(svc.enforce('privacy', 'u')).rejects.toMatchObject({ retryAfterS: 3600 });
  });

  it('reset zera a contagem (login certo limpa as tentativas)', async () => {
    const { svc } = make();
    for (let i = 0; i < POLICIES.loginAccount.limit; i++) await svc.hit('loginAccount', 'a');
    await svc.reset('loginAccount', 'a');
    expect((await svc.hit('loginAccount', 'a')).count).toBe(1);
  });

  it('se o Redis cair, libera (não derruba a API) em vez de negar tudo', async () => {
    const { svc, redis } = make();
    redis.fail = true;
    expect((await svc.hit('default', 'x')).allowed).toBe(true);
    await expect(svc.enforce('default', 'x')).resolves.toBeUndefined();
  });

  it('rotas de login FALHAM FECHADO se o Redis cair (503); as demais seguem abertas', async () => {
    const { svc, redis } = make();
    redis.fail = true;
    for (const policy of [
      'loginIp',
      'loginAccountIp',
      'loginAccount',
      'refresh',
      'firstAccess',
    ] as const) {
      const hit = await svc.hit(policy, 'x');
      expect(hit).toMatchObject({ allowed: false, degraded: true });
      await expect(svc.enforce(policy, 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
    }
    expect((await svc.hit('upload', 'x')).allowed).toBe(true);
    expect(FAIL_CLOSED.has('playbackSession')).toBe(false);
  });

  it('lockout por conta+IP é independente por IP: o IP do atacante não tranca a vítima em outro IP', async () => {
    const { svc } = make();
    const { limit } = POLICIES.loginAccountIp;
    for (let i = 0; i < limit + 1; i++)
      await svc.hit('loginAccountIp', 'tenant|vitima@x.com|9.9.9.9');
    expect((await svc.hit('loginAccountIp', 'tenant|vitima@x.com|9.9.9.9')).allowed).toBe(false);
    expect((await svc.hit('loginAccountIp', 'tenant|vitima@x.com|1.1.1.1')).allowed).toBe(true);
    // mas o teto global da conta é maior que o por-IP (barra ataque distribuído)
    expect(POLICIES.loginAccount.limit).toBeGreaterThan(POLICIES.loginAccountIp.limit);
  });

  it('desligado por configuração não conta nada', async () => {
    const { svc, redis } = make(false);
    for (let i = 0; i < 1000; i++) await svc.enforce('loginAccount', 'a');
    expect(redis.counts.size).toBe(0);
  });

  it('registra quantos bloqueios houve por política (métrica)', async () => {
    const { svc } = make();
    for (let i = 0; i < POLICIES.privacy.limit + 3; i++) await svc.hit('privacy', 'u');
    expect(svc.blocked.get('privacy')).toBe(3);
  });
});
