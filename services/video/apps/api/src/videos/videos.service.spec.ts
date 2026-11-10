import { originalKey, planParts } from './videos.service';

const MiB = 1024 * 1024;

describe('planParts', () => {
  it('usa 1 parte para arquivos pequenos', () => {
    expect(planParts(3 * MiB)).toEqual({ partSize: 16 * MiB, partCount: 1 });
  });

  it('divide em partes de 16 MiB', () => {
    expect(planParts(100 * MiB)).toEqual({ partSize: 16 * MiB, partCount: 7 });
    expect(planParts(32 * MiB)).toEqual({ partSize: 16 * MiB, partCount: 2 });
  });

  it('nunca passa de 10.000 partes, mesmo para arquivos enormes', () => {
    const size = 200 * 1024 * MiB; // 200 GiB
    const { partSize, partCount } = planParts(size);
    expect(partCount).toBeLessThanOrEqual(10_000);
    expect(partSize * partCount).toBeGreaterThanOrEqual(size);
  });
});

describe('originalKey', () => {
  it('fica sob o prefixo da empresa', () => {
    expect(originalKey('t1', 'v1', '.mp4')).toBe('tenants/t1/originals/v1/source.mp4');
  });
});
