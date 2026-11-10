import Redis from 'ioredis';
import { createHash } from 'node:crypto';

const shas = new Map<string, string>();

/**
 * Executa um script Lua por EVALSHA (só o hash viaja pela rede, em vez do texto inteiro a cada
 * chamada). Se o Redis ainda não conhece o script (reinício, primeiro uso), cai para EVAL, que
 * também o carrega no cache.
 */
export async function runScript(
  redis: Pick<Redis, 'evalsha' | 'eval'>,
  script: string,
  numKeys: number,
  ...args: (string | number)[]
): Promise<unknown> {
  let sha = shas.get(script);
  if (!sha) {
    sha = createHash('sha1').update(script).digest('hex');
    shas.set(script, sha);
  }
  try {
    return await redis.evalsha(sha, numKeys, ...args);
  } catch (e) {
    if (/NOSCRIPT/.test((e as Error).message)) return redis.eval(script, numKeys, ...args);
    throw e;
  }
}
