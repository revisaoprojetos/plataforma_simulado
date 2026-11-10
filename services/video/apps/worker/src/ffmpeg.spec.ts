import { run } from './ffmpeg';

const sleeper = ['-e', 'setTimeout(() => {}, 60000)'];

describe('run (cancelamento e timeout)', () => {
  it('cancela o processo filho e rejeita com o motivo do sinal', async () => {
    const ac = new AbortController();
    const p = run(process.execPath, sleeper, { signal: ac.signal });
    setTimeout(() => ac.abort(new Error('motivo-x')), 200);
    const t0 = Date.now();
    await expect(p).rejects.toThrow('motivo-x');
    expect(Date.now() - t0).toBeLessThan(10_000);
  });

  it('não executa nada se o sinal já veio cancelado', async () => {
    const ac = new AbortController();
    ac.abort(new Error('ja-cancelado'));
    await expect(run(process.execPath, sleeper, { signal: ac.signal })).rejects.toThrow(
      'ja-cancelado',
    );
  });

  it('timeout por comando continua valendo (probe/poster)', async () => {
    await expect(run(process.execPath, sleeper, { timeoutMs: 300 })).rejects.toThrow(
      /tempo limite/,
    );
  });

  it('devolve stdout quando termina bem', async () => {
    const r = await run(process.execPath, ['-e', 'process.stdout.write("ok")']);
    expect(r.stdout).toBe('ok');
  });
});
