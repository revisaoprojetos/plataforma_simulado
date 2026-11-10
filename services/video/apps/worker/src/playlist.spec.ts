import { selectRenditions } from './ladder';
import { buildMasterPlaylist, buildSpriteVtt, formatVttTime, spriteLayout } from './playlist';

describe('buildMasterPlaylist', () => {
  const renditions = selectRenditions(1280, 720);

  it('lista as qualidades da menor para a maior com resolução e codecs', () => {
    const text = buildMasterPlaylist(renditions, true);
    const uris = text.split('\n').filter((l) => l.endsWith('/index.m3u8'));
    expect(uris).toEqual([
      '240p/index.m3u8',
      '360p/index.m3u8',
      '480p/index.m3u8',
      '720p/index.m3u8',
    ]);
    expect(text).toContain('RESOLUTION=1280x720');
    expect(text).toContain('CODECS="avc1.4d401f,mp4a.40.2"');
    expect(text.startsWith('#EXTM3U\n')).toBe(true);
  });

  it('sem áudio omite o codec de áudio', () => {
    expect(buildMasterPlaylist(renditions, false)).not.toContain('mp4a');
  });
});

describe('sprite', () => {
  it('vídeo curto: 1 miniatura a cada 5 s', () => {
    expect(spriteLayout(20)).toMatchObject({ interval: 5, count: 4, cols: 4, rows: 1 });
  });

  it('vídeo longo: no máximo ~100 miniaturas em grade de 10 colunas', () => {
    const l = spriteLayout(3600);
    expect(l.count).toBeLessThanOrEqual(100);
    expect(l.cols).toBe(10);
    expect(l.rows * l.cols).toBeGreaterThanOrEqual(l.count);
  });

  it('formata tempos do WebVTT', () => {
    expect(formatVttTime(0)).toBe('00:00:00.000');
    expect(formatVttTime(65.5)).toBe('00:01:05.500');
    expect(formatVttTime(3725.04)).toBe('01:02:05.040');
  });

  it('VTT mapeia cada trecho para um recorte do sprite e o último termina na duração', () => {
    const layout = spriteLayout(12);
    const vtt = buildSpriteVtt(12, layout);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:05.000\nsprite.jpg#xywh=0,0,160,90');
    expect(vtt).toContain('00:00:10.000 --> 00:00:12.000\nsprite.jpg#xywh=320,0,160,90');
  });
});
