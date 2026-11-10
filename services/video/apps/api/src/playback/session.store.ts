import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { runScript } from '../redis/script';

// Sessões de reprodução por usuário num sorted set: membro = sessionId, score = expira em (ms).
// Tudo em Lua para ser atômico (duas abas abrindo ao mesmo tempo não furam o limite).

const ACQUIRE = `
local key, now, ttl, limit, sid = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
if redis.call('ZSCORE', key, sid) then
  redis.call('ZADD', key, now + ttl, sid); redis.call('PEXPIRE', key, ttl * 2); return 1
end
if redis.call('ZCARD', key) >= limit then return 0 end
redis.call('ZADD', key, now + ttl, sid); redis.call('PEXPIRE', key, ttl * 2); return 1
`;

const TOUCH = `
local key, now, ttl, sid = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), ARGV[3]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
if redis.call('ZSCORE', key, sid) then
  redis.call('ZADD', key, now + ttl, sid); redis.call('PEXPIRE', key, ttl * 2); return 1
end
return 0
`;

@Injectable()
export class SessionStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(userId: string) {
    return `ps:${userId}`;
  }

  /** Abre (ou reaproveita) a sessão. false = limite de sessões simultâneas atingido. */
  async acquire(userId: string, sessionId: string, limit: number, ttlMs: number): Promise<boolean> {
    const ok = await runScript(
      this.redis,
      ACQUIRE,
      1,
      this.key(userId),
      Date.now(),
      ttlMs,
      limit,
      sessionId,
    );
    return ok === 1;
  }

  /** Renova uma sessão existente. false = sessão não existe mais (encerrada ou expirada). */
  async touch(userId: string, sessionId: string, ttlMs: number): Promise<boolean> {
    return (
      (await runScript(this.redis, TOUCH, 1, this.key(userId), Date.now(), ttlMs, sessionId)) === 1
    );
  }

  async isActive(userId: string, sessionId: string): Promise<boolean> {
    const score = await this.redis.zscore(this.key(userId), sessionId);
    return score !== null && Number(score) > Date.now();
  }

  async release(userId: string, sessionId: string): Promise<void> {
    await this.redis.zrem(this.key(userId), sessionId);
  }
}
