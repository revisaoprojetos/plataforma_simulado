import { coveredSeconds, isCompleted, mergeRanges, percentWatched, Range } from './ranges';

describe('mergeRanges', () => {
  it('une trechos sobrepostos e colados, independente da ordem', () => {
    const merged = mergeRanges(
      [
        [20, 30],
        [0, 10],
        [10, 20.5],
        [50, 60],
      ],
      100,
    );
    expect(merged).toEqual([
      [0, 30],
      [50, 60],
    ]);
  });

  it('lacuna de até 1 s é ruído de heartbeat; maior que isso é pulo', () => {
    expect(
      mergeRanges(
        [
          [0, 10],
          [10.9, 20],
        ],
        100,
      ),
    ).toEqual([[0, 20]]);
    expect(
      mergeRanges(
        [
          [0, 10],
          [12, 20],
        ],
        100,
      ),
    ).toEqual([
      [0, 10],
      [12, 20],
    ]);
  });

  it('limita à duração, descarta vazios e invertidos, e não altera a entrada', () => {
    const input: Range[] = [
      [90, 130],
      [5, 5],
      [8, 3],
      [-5, 4],
    ];
    const copy = JSON.stringify(input);
    expect(mergeRanges(input, 100)).toEqual([
      [0, 4],
      [90, 100],
    ]);
    expect(JSON.stringify(input)).toBe(copy);
  });

  it('é idempotente (reaplicar o mesmo resultado não muda nada)', () => {
    const once = mergeRanges(
      [
        [0, 10],
        [5, 15],
        [40, 50],
      ],
      100,
    );
    expect(mergeRanges(once, 100)).toEqual(once);
  });
});

describe('cobertura e conclusão', () => {
  it('soma segundos únicos e calcula percentual', () => {
    const merged: Range[] = [
      [0, 20],
      [80, 90],
    ];
    expect(coveredSeconds(merged)).toBe(30);
    expect(percentWatched(merged, 100)).toBe(30);
    expect(percentWatched(merged, 0)).toBe(0);
  });

  it('conclui com 90% de cobertura; pular para o fim não conclui', () => {
    expect(isCompleted([[0, 90]], 100)).toBe(true);
    expect(isCompleted([[0, 89.9]], 100)).toBe(false);
    expect(isCompleted([[95, 100]], 100)).toBe(false);
    expect(isCompleted([[0, 5]], 0)).toBe(false);
  });
});
