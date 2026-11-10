import { selectRenditions } from './ladder';

describe('selectRenditions', () => {
  it('1080p inclui toda a escada', () => {
    expect(selectRenditions(1920, 1080).map((r) => r.name)).toEqual([
      '240p',
      '360p',
      '480p',
      '720p',
      '1080p',
    ]);
  });

  it('nunca faz upscale', () => {
    expect(selectRenditions(1280, 720).map((r) => r.name)).toEqual([
      '240p',
      '360p',
      '480p',
      '720p',
    ]);
    expect(selectRenditions(640, 360).map((r) => r.name)).toEqual(['240p', '360p']);
  });

  it('origem menor que 240p gera uma única qualidade na altura original', () => {
    const r = selectRenditions(200, 150);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: '150p', height: 150, width: 200 });
  });

  it('largura sempre par e proporcional (inclusive vertical e 4:3)', () => {
    expect(selectRenditions(1920, 1080).find((r) => r.height === 360)?.width).toBe(640);
    expect(selectRenditions(1440, 1080).find((r) => r.height === 480)?.width).toBe(640);
    for (const r of selectRenditions(1080, 1920)) expect(r.width % 2).toBe(0);
  });

  it('bandwidth inclui áudio com folga de 10%', () => {
    const r = selectRenditions(1280, 720).find((x) => x.name === '720p')!;
    expect(r.bandwidth).toBe(Math.round((2800 + 128) * 1000 * 1.1));
  });
});
