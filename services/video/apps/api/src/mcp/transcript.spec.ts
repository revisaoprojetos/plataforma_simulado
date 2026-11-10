import { pageSegments, Segment } from './transcript';

const seg = (i: number, text: string): Segment => ({ startS: i, endS: i + 1, text });

describe('pageSegments', () => {
  const all = [seg(0, 'aaaa'), seg(1, 'bbbb'), seg(2, 'cccc')];

  it('devolve tudo e sem cursor quando cabe', () => {
    expect(pageSegments(all, undefined, 100)).toEqual({ segments: all, nextCursor: null });
  });

  it('corta pelo limite de caracteres e continua pelo cursor', () => {
    const first = pageSegments(all, undefined, 8);
    expect(first.segments).toEqual([all[0], all[1]]);
    expect(first.nextCursor).toBe('2');
    const second = pageSegments(all, first.nextCursor ?? undefined, 8);
    expect(second).toEqual({ segments: [all[2]], nextCursor: null });
  });

  it('um trecho maior que o limite ainda é devolvido (senão a paginação trava)', () => {
    const page = pageSegments([seg(0, 'x'.repeat(50)), seg(1, 'y')], undefined, 10);
    expect(page.segments).toHaveLength(1);
    expect(page.nextCursor).toBe('1');
  });

  it('cursor inválido é recusado', () => {
    for (const bad of ['-1', 'abc', '1.5', '99']) {
      expect(() => pageSegments(all, bad, 10)).toThrow(RangeError);
    }
  });
});
