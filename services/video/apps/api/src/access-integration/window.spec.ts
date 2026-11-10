import { hasWindowInput, parseWhen, resolveWindow } from './window';

const NOW = new Date('2026-11-01T15:00:00Z');

describe('parseWhen', () => {
  it('data sem hora vale o dia inteiro em São Paulo', () => {
    expect(parseWhen('2026-11-30', 'start', 'x').toISOString()).toBe('2026-11-30T03:00:00.000Z');
    expect(parseWhen('2026-11-30', 'end', 'x').toISOString()).toBe('2026-12-01T02:59:59.999Z');
  });

  it('respeita Z e deslocamento; sem fuso assume São Paulo', () => {
    expect(parseWhen('2026-11-30T10:00:00Z', 'start', 'x').toISOString()).toBe(
      '2026-11-30T10:00:00.000Z',
    );
    expect(parseWhen('2026-11-30T10:00:00+02:00', 'start', 'x').toISOString()).toBe(
      '2026-11-30T08:00:00.000Z',
    );
    expect(parseWhen('2026-11-30T10:00:00', 'start', 'x').toISOString()).toBe(
      '2026-11-30T13:00:00.000Z',
    );
  });

  it('data inválida é recusada com o nome do campo', () => {
    expect(() => parseWhen('2026-13-45', 'start', 'startsAt')).toThrow(/startsAt inválido/);
    expect(() => parseWhen('amanhã', 'end', 'endsAt')).toThrow(/endsAt inválido/);
  });
});

describe('resolveWindow', () => {
  it('sem datas: sem limite', () => {
    expect(resolveWindow({}, NOW)).toEqual({ startsAt: null, endsAt: null });
  });

  it('accessDays conta de agora ou do início', () => {
    expect(resolveWindow({ accessDays: 30 }, NOW).endsAt?.toISOString()).toBe(
      '2026-12-01T15:00:00.000Z',
    );
    const w = resolveWindow({ startsAt: '2027-01-10', accessDays: 7 }, NOW);
    expect(w.startsAt?.toISOString()).toBe('2027-01-10T03:00:00.000Z');
    expect(w.endsAt?.toISOString()).toBe('2027-01-17T03:00:00.000Z');
  });

  it('recusa fim antes do início, fim já passado e endsAt junto com accessDays', () => {
    expect(() => resolveWindow({ startsAt: '2026-12-10', endsAt: '2026-12-01' }, NOW)).toThrow(
      /depois do início/,
    );
    expect(() => resolveWindow({ endsAt: '2026-10-01' }, NOW)).toThrow(/depois do início/);
    expect(() => resolveWindow({ endsAt: '2026-12-01', accessDays: 5 }, NOW)).toThrow(
      /não os dois/,
    );
  });
});

describe('hasWindowInput', () => {
  it('só é "pelada" quando não vem data nem prazo (1.1)', () => {
    expect(hasWindowInput({})).toBe(false);
    expect(hasWindowInput({ startsAt: '2026-11-01' })).toBe(true);
    expect(hasWindowInput({ endsAt: '2026-12-01' })).toBe(true);
    expect(hasWindowInput({ accessDays: 30 })).toBe(true);
  });
});
