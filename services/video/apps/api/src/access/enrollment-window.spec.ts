import { activeEnrollment, isEnrollmentActive } from './enrollment-window';

const NOW = new Date('2026-11-01T12:00:00Z');
const at = (iso: string | null) => (iso ? new Date(iso) : null);
const row = (startsAt: string | null, endsAt: string | null, revokedAt: string | null = null) => ({
  startsAt: at(startsAt),
  endsAt: at(endsAt),
  revokedAt: at(revokedAt),
});

describe('isEnrollmentActive', () => {
  it('matrícula antiga, sem datas, vale sempre', () => {
    expect(isEnrollmentActive(row(null, null), NOW)).toBe(true);
  });

  it('respeita início e fim (início inclusivo, fim exclusivo)', () => {
    expect(isEnrollmentActive(row('2026-11-01T12:00:00Z', null), NOW)).toBe(true);
    expect(isEnrollmentActive(row('2026-11-01T12:00:01Z', null), NOW)).toBe(false);
    expect(isEnrollmentActive(row(null, '2026-11-01T12:00:01Z'), NOW)).toBe(true);
    expect(isEnrollmentActive(row(null, '2026-11-01T12:00:00Z'), NOW)).toBe(false);
  });

  it('revogada nunca vale, mesmo dentro da janela', () => {
    expect(isEnrollmentActive(row(null, null, '2026-10-01T00:00:00Z'), NOW)).toBe(false);
  });
});

describe('activeEnrollment (filtro Prisma)', () => {
  it('descreve a mesma regra: sem revogação e janela aberta nos dois lados', () => {
    const f = activeEnrollment(NOW);
    expect(f.revokedAt).toBeNull();
    expect(f.AND).toEqual([
      { OR: [{ startsAt: null }, { startsAt: { lte: NOW } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: NOW } }] },
    ]);
  });
});
