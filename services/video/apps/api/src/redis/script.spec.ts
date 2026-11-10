import { createHash } from 'node:crypto';
import { runScript } from './script';

const SCRIPT = "return redis.call('PING')";
const SHA = createHash('sha1').update(SCRIPT).digest('hex');

describe('runScript', () => {
  it('usa EVALSHA com o hash do script', async () => {
    const calls: string[] = [];
    const redis = {
      evalsha: async (sha: string, n: number, ...a: unknown[]) => {
        calls.push(`evalsha ${sha} ${n} ${a.join(',')}`);
        return 'ok';
      },
      eval: async () => {
        calls.push('eval');
        return 'eval';
      },
    };
    expect(await runScript(redis as never, SCRIPT, 1, 'chave', 7)).toBe('ok');
    expect(calls).toEqual([`evalsha ${SHA} 1 chave,7`]);
  });

  it('cai para EVAL quando o Redis ainda não conhece o script (NOSCRIPT)', async () => {
    const calls: string[] = [];
    const redis = {
      evalsha: async () => {
        calls.push('evalsha');
        throw new Error('NOSCRIPT No matching script. Please use EVAL.');
      },
      eval: async (_s: string, _n: number, ...a: unknown[]) => {
        calls.push(`eval ${a.join(',')}`);
        return 'carregado';
      },
    };
    expect(await runScript(redis as never, SCRIPT, 1, 'k')).toBe('carregado');
    expect(calls).toEqual(['evalsha', 'eval k']);
  });

  it('outros erros não são mascarados', async () => {
    const redis = {
      evalsha: async () => {
        throw new Error('ERR script falhou');
      },
      eval: async () => 'nunca',
    };
    await expect(runScript(redis as never, SCRIPT, 0)).rejects.toThrow(/script falhou/);
  });
});
