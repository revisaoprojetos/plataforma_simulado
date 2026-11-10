import { logLevelFor, serializeReq } from './logging';

describe('logLevelFor', () => {
  it('heartbeat bem-sucedido não polui o nível info; falhas continuam visíveis', () => {
    expect(logLevelFor('/v1/progress/heartbeat?t=x', 204, false)).toBe('debug');
    expect(logLevelFor('/v1/progress/heartbeat', 401, false)).toBe('warn');
    expect(logLevelFor('/v1/progress/heartbeat', 429, false)).toBe('warn');
    expect(logLevelFor('/v1/progress/heartbeat', 500, false)).toBe('error');
  });

  it('demais rotas: 2xx info, 4xx warn, 5xx/erro error', () => {
    expect(logLevelFor('/v1/courses', 200, false)).toBe('info');
    expect(logLevelFor('/v1/courses', 404, false)).toBe('warn');
    expect(logLevelFor('/v1/courses', 503, false)).toBe('error');
    expect(logLevelFor('/v1/courses', 200, true)).toBe('error');
  });
});

describe('serializeReq', () => {
  const req = {
    id: 'abc-12345',
    method: 'GET',
    originalUrl: '/v1/hls/vid/master.m3u8?t=eyJhbGciOiJIUzI1NiJ9.payload.assinatura',
    url: '/master.m3u8?t=outro',
    remoteAddress: '10.0.0.7',
    headers: { authorization: 'Bearer SEGREDO', cookie: 'sid=SEGREDO' },
    body: { password: 'SEGREDO' },
  };

  it('não deixa passar token de playback na URL', () => {
    expect(serializeReq(req).url).toBe('/v1/hls/vid/master.m3u8?t=[redacted]');
  });

  it('só emite campos permitidos: sem cabeçalhos, cookies nem corpo', () => {
    const out = serializeReq(req);
    expect(Object.keys(out).sort()).toEqual(['id', 'ip', 'method', 'url']);
    expect(JSON.stringify(out)).not.toContain('SEGREDO');
  });

  it('usa url quando não há originalUrl', () => {
    expect(serializeReq({ id: 'x', method: 'POST', url: '/v1/x?t=abc' }).url).toBe(
      '/v1/x?t=[redacted]',
    );
  });
});
