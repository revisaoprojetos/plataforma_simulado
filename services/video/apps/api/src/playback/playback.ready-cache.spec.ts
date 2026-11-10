import { PlaybackService, READY_CACHE_MS } from './playback.service';

/** Instancia sem o construtor pesado: só o necessário para exercitar o cache de readyVideo (1.10). */
function make() {
  const calls = { n: 0 };
  let present = true;
  const svc = Object.create(PlaybackService.prototype) as unknown as Record<string, unknown>;
  svc['readyCache'] = new Map();
  svc['prisma'] = {
    video: {
      findFirst: async () => {
        calls.n++;
        return present ? { id: 'v1', tenantId: 't1', status: 'ready', renditions: [] } : null;
      },
    },
  };
  const ready = (svc as unknown as { readyVideo: (c: object) => Promise<unknown> }).readyVideo.bind(
    svc,
  );
  return {
    ready,
    calls,
    remove: () => {
      present = false;
    },
  };
}

const claims = { tid: 't1', vid: 'v1' };

describe('cache do vídeo pronto no HLS (1.10)', () => {
  it('manifest + variantes + chave fazem UMA consulta ao banco, não uma por requisição', async () => {
    const { ready, calls } = make();
    for (let i = 0; i < 50; i++) await ready(claims);
    expect(calls.n).toBe(1);
  });

  it('só guarda acerto: vídeo inexistente sempre reconsulta e dá 404', async () => {
    const { ready, calls, remove } = make();
    remove();
    await expect(ready(claims)).rejects.toThrow(/não encontrado/);
    await expect(ready(claims)).rejects.toThrow(/não encontrado/);
    expect(calls.n).toBe(2);
  });

  it('o cache é curto (até 15 s), para exclusão/reprocessamento valerem logo', () => {
    expect(READY_CACHE_MS).toBeLessThanOrEqual(15_000);
  });
});
