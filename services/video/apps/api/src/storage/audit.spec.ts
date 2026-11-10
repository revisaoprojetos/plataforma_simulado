import { auditKeys, KnownState, postureWarnings } from './audit';

const known: KnownState = {
  tenantIds: new Set(['t1']),
  videos: new Set(['t1/v1', 't1/v2']),
  readyVideos: new Set(['t1/v1']),
  subtitleKeys: new Set(['tenants/t1/subtitles/l1/pt.vtt']),
};

const complete = [
  'tenants/t1/originals/v1/source.mp4',
  'tenants/t1/videos/v1/hls/master.m3u8',
  'tenants/t1/videos/v1/hls/key.bin',
  'tenants/t1/videos/v1/hls/720p/seg_000.ts',
  'tenants/t1/originals/v2/source.mp4',
  'tenants/t1/subtitles/l1/pt.vtt',
];

describe('auditKeys', () => {
  it('bucket consistente com o banco não gera achados', () => {
    expect(auditKeys(complete, known)).toEqual([]);
  });

  it('tolera o lixo dos scripts de verificação', () => {
    expect(auditKeys([...complete, '_smoke/123/hello.txt'], known)).toEqual([]);
  });

  it('aponta objeto fora de tenants/ e de empresa desconhecida', () => {
    const f = auditKeys(
      [...complete, 'backup/dump.sql', 'tenants/zzz/videos/v1/hls/key.bin'],
      known,
    );
    expect(f.map((x) => x.kind).sort()).toEqual(['unexpected-prefix', 'unknown-tenant']);
  });

  it('aponta vídeo e legenda que o banco não conhece', () => {
    const f = auditKeys(
      [...complete, 'tenants/t1/videos/ghost/hls/key.bin', 'tenants/t1/subtitles/l9/en.vtt'],
      known,
    );
    expect(f).toEqual([
      { kind: 'orphan-video', key: 'tenants/t1/videos/ghost/hls/key.bin', detail: 'ghost' },
      { kind: 'orphan-subtitle', key: 'tenants/t1/subtitles/l9/en.vtt' },
    ]);
  });

  it('vídeo pronto sem master ou sem chave é reportado', () => {
    const f = auditKeys(
      complete.filter((k) => !k.endsWith('master.m3u8') && !k.endsWith('key.bin')),
      known,
    );
    expect(f.map((x) => x.key)).toEqual([
      'tenants/t1/videos/v1/hls/master.m3u8',
      'tenants/t1/videos/v1/hls/key.bin',
    ]);
  });

  it('vídeo ainda em processamento não precisa de HLS', () => {
    expect(
      auditKeys(['tenants/t1/originals/v2/source.mp4'], { ...known, readyVideos: new Set() }),
    ).toEqual([]);
  });

  it('outro caminho dentro de uma empresa é inesperado', () => {
    expect(auditKeys([...complete, 'tenants/t1/notas.txt'], known)).toEqual([
      { kind: 'unexpected-prefix', key: 'tenants/t1/notas.txt' },
    ]);
  });
});

describe('postureWarnings', () => {
  it('avisa de ACL pública e de credencial que enxerga outros buckets', () => {
    expect(postureWarnings({ publicGrants: [], hasPolicy: false, visibleBuckets: 1 })).toEqual([]);
    const w = postureWarnings({
      publicGrants: ['AllUsers:READ'],
      hasPolicy: false,
      visibleBuckets: 9,
    });
    expect(w).toHaveLength(2);
    expect(w[1]).toMatch(/9 buckets/);
  });
});
