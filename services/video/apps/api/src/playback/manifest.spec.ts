import { rewriteMaster, rewriteSpriteVtt, rewriteVariant, segmentNames } from './manifest';

const master = [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=510400,RESOLUTION=426x240',
  '240p/index.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=985600,RESOLUTION=640x360',
  '360p/index.m3u8',
  '',
].join('\n');

const variant = [
  '#EXTM3U',
  '#EXT-X-KEY:METHOD=AES-128,URI="__KEY_URI__",IV=0x0aff96147f137cf7a4672d0e79fe8385',
  '#EXTINF:6.000000,',
  'seg_00000.ts',
  '#EXTINF:6.000000,',
  'seg_00001.ts',
  '#EXT-X-ENDLIST',
  '',
].join('\n');

describe('rewriteMaster', () => {
  it('acrescenta o token (codificado) só nas linhas de URI', () => {
    const out = rewriteMaster(master, 'a.b+c');
    expect(out).toContain('240p/index.m3u8?t=a.b%2Bc');
    expect(out).toContain('360p/index.m3u8?t=a.b%2Bc');
    expect(out).toContain('#EXT-X-STREAM-INF:BANDWIDTH=510400,RESOLUTION=426x240\n');
  });
});

describe('rewriteVariant', () => {
  const signed = new Map([
    ['seg_00000.ts', 'https://s3/x/seg_00000.ts?sig=1'],
    ['seg_00001.ts', 'https://s3/x/seg_00001.ts?sig=2'],
  ]);

  it('lista os segmentos, troca a chave e assina cada segmento', () => {
    expect(segmentNames(variant)).toEqual(['seg_00000.ts', 'seg_00001.ts']);
    const out = rewriteVariant(variant, '/v1/hls/key/vid?t=tok', signed);
    expect(out).toContain('URI="/v1/hls/key/vid?t=tok",IV=0x0aff');
    expect(out).not.toContain('__KEY_URI__');
    expect(out).toContain('https://s3/x/seg_00000.ts?sig=1');
    expect(out).toContain('https://s3/x/seg_00001.ts?sig=2');
    expect(out).toContain('#EXT-X-ENDLIST');
  });

  it('rejeita nomes de segmento fora do padrão (nada de path traversal)', () => {
    const evil = variant.replace('seg_00001.ts', '../../../other-tenant/seg_00001.ts');
    expect(() => rewriteVariant(evil, 'k', signed)).toThrow(/segmento inesperado/);
    expect(() =>
      rewriteVariant(variant.replace('seg_00001.ts', 'https://evil/x.ts'), 'k', signed),
    ).toThrow();
  });
});

describe('rewriteSpriteVtt', () => {
  it('troca o nome do sprite pela URL assinada em todos os recortes', () => {
    const vtt =
      'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nsprite.jpg#xywh=0,0,160,90\n\n00:00:05.000 --> 00:00:10.000\nsprite.jpg#xywh=160,0,160,90\n';
    const out = rewriteSpriteVtt(vtt, 'https://s3/sprite.jpg?sig=9');
    expect(out.match(/https:\/\/s3\/sprite\.jpg\?sig=9#xywh/g)).toHaveLength(2);
  });
});
