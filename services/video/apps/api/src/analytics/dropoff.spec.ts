import { findDropoffs, RetentionPoint } from './dropoff';

const curve = (viewers: number[]): RetentionPoint[] =>
  viewers.map((v, i) => ({ bucketS: i * 5, viewers: v }));

describe('findDropoffs', () => {
  it('ordena pelas maiores quedas e informa o instante em que ocorrem', () => {
    // 5 → 4 (em 5s), 4 → 2 (em 30s), 2 → 1 (em 50s)
    const d = findDropoffs(curve([5, 4, 4, 4, 4, 4, 2, 2, 2, 2, 1, 1]));
    expect(d).toEqual([
      { atS: 30, fromViewers: 4, toViewers: 2, lostViewers: 2 },
      { atS: 5, fromViewers: 5, toViewers: 4, lostViewers: 1 },
      { atS: 50, fromViewers: 2, toViewers: 1, lostViewers: 1 },
    ]);
  });

  it('empate vence o instante mais cedo e respeita o limite', () => {
    const d = findDropoffs(curve([3, 2, 1, 0]), 2);
    expect(d.map((x) => x.atS)).toEqual([5, 10]);
  });

  it('audiência que não cai (ou sobe) não gera abandono', () => {
    expect(findDropoffs(curve([2, 2, 3, 3]))).toEqual([]);
    expect(findDropoffs([])).toEqual([]);
  });
});
