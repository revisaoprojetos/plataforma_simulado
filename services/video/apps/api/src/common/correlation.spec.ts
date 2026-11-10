import { currentCorrelationId, correlationMiddleware, redactUrl } from './correlation';

type Req = { headers: Record<string, string | string[] | undefined>; id?: string };

function run(headers: Req['headers']) {
  const req: Req = { headers };
  const sent: Record<string, string> = {};
  let seen: string | undefined;
  correlationMiddleware(
    req as never,
    { setHeader: (k: string, v: string) => (sent[k] = v) } as never,
    () => (seen = currentCorrelationId()),
  );
  return { req, sent, seen };
}

describe('correlationMiddleware', () => {
  it('gera um id, devolve no cabeçalho e expõe no contexto', () => {
    const { req, sent, seen } = run({});
    expect(sent['X-Correlation-Id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(req.id).toBe(sent['X-Correlation-Id']);
    expect(seen).toBe(req.id);
  });

  it('reaproveita um id válido vindo do cliente/proxy', () => {
    expect(run({ 'x-correlation-id': 'req-abc_123.XYZ' }).sent['X-Correlation-Id']).toBe(
      'req-abc_123.XYZ',
    );
  });

  it('descarta ids perigosos ou fora do padrão (injeção em logs)', () => {
    for (const bad of [
      'curto',
      'a'.repeat(65),
      'tem espaço aqui',
      'linha\nnova-12345',
      '<script>alert(1)</script>',
    ]) {
      const id = run({ 'x-correlation-id': bad }).sent['X-Correlation-Id'];
      expect(id).not.toBe(bad);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('fora de uma requisição não há id', () => {
    expect(currentCorrelationId()).toBeUndefined();
  });
});

describe('redactUrl', () => {
  it('esconde o token de playback em qualquer posição da query', () => {
    expect(redactUrl('/v1/hls/abc/master.m3u8?t=eyJhbGciOi.xyz.123')).toBe(
      '/v1/hls/abc/master.m3u8?t=[redacted]',
    );
    expect(redactUrl('/v1/x?a=1&t=segredo&b=2')).toBe('/v1/x?a=1&t=[redacted]&b=2');
  });

  it('não mexe em parâmetros parecidos nem em URLs sem token', () => {
    expect(redactUrl('/v1/x?start=5&format=csv')).toBe('/v1/x?start=5&format=csv');
    expect(redactUrl('/v1/courses')).toBe('/v1/courses');
  });
});
