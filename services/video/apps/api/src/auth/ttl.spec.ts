import { ttlToSeconds } from './ttl';

describe('ttlToSeconds', () => {
  it('converte unidades', () => {
    expect(ttlToSeconds('30s')).toBe(30);
    expect(ttlToSeconds('15m')).toBe(900);
    expect(ttlToSeconds('2h')).toBe(7200);
    expect(ttlToSeconds('7d')).toBe(604800);
  });

  it('rejeita formato inválido', () => {
    expect(() => ttlToSeconds('abc')).toThrow(/inválido/);
    expect(() => ttlToSeconds('10')).toThrow(/inválido/);
  });
});
