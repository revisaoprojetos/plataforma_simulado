import { BadRequestException } from '@nestjs/common';
import { daysOf, resolvePeriod } from './period';

const NOW = new Date('2026-10-26T15:30:00.000Z');

describe('resolvePeriod', () => {
  it('sem parâmetros: últimos 30 dias até agora', () => {
    const p = resolvePeriod(undefined, undefined, NOW);
    expect(p.to).toEqual(NOW);
    expect(p.from).toEqual(new Date('2026-09-26T15:30:00.000Z'));
  });

  it('"to" só com data inclui o dia inteiro (fim exclusivo no dia seguinte)', () => {
    const p = resolvePeriod('2026-10-01', '2026-10-05', NOW);
    expect(p.from).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    expect(p.to).toEqual(new Date('2026-10-06T00:00:00.000Z'));
  });

  it('aceita data e hora completas', () => {
    const p = resolvePeriod('2026-10-01T10:00:00Z', '2026-10-02T10:00:00Z', NOW);
    expect(p.to.toISOString()).toBe('2026-10-02T10:00:00.000Z');
  });

  it('rejeita datas inválidas, período invertido ou acima de 366 dias', () => {
    expect(() => resolvePeriod('ontem', undefined, NOW)).toThrow(BadRequestException);
    expect(() => resolvePeriod('2026-10-10', '2026-10-01', NOW)).toThrow(/anterior/);
    expect(() => resolvePeriod('2020-01-01', '2026-01-01', NOW)).toThrow(/máximo/);
  });
});

describe('daysOf', () => {
  it('lista cada dia UTC do período', () => {
    expect(daysOf(resolvePeriod('2026-10-30', '2026-11-02', NOW))).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('um período dentro do mesmo dia gera um único dia', () => {
    expect(
      daysOf({ from: new Date('2026-10-26T01:00:00Z'), to: new Date('2026-10-26T20:00:00Z') }),
    ).toEqual(['2026-10-26']);
  });
});
