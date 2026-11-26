import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/cache/relatorio-cache', () => ({ remember: async (_k: string, _t: number, f: () => unknown) => f() }))

import { hashesEspelho, linhasDiferentes } from '../plano-metas'

const base = { cfg: { start: '2026-01-05', vel: 30, horas: [1, 1, 1] } as Record<string, unknown>, extras: [] as unknown, pausa: null as unknown, plano: { 'pf:0:a': ['2026-01-05', 1] } as Record<string, unknown> }

describe('hashesEspelho', () => {
  it('mudar cfg (fora do start) não muda o hash das linhas, só o do cfg', () => {
    const a = hashesEspelho(base, {})
    const b = hashesEspelho({ ...base, cfg: { ...base.cfg, vel: 40 } }, {})
    expect(b.linhas).toBe(a.linhas)
    expect(b.cfg).not.toBe(a.cfg)
  })
  it('extras/pausa só afetam o hash do cfg', () => {
    const a = hashesEspelho(base, {})
    const b = hashesEspelho({ ...base, extras: [{ id: 'x' }], pausa: { desde: '2026-02-01' } }, {})
    expect(b.linhas).toBe(a.linhas)
    expect(b.cfg).not.toBe(a.cfg)
  })
  it('grade, detalhes e start afetam o hash das linhas', () => {
    const a = hashesEspelho(base, {})
    expect(hashesEspelho({ ...base, plano: { 'pf:0:a': ['2026-01-06', 1] } }, {}).linhas).not.toBe(a.linhas)
    expect(hashesEspelho(base, { 'pf:0:a': { n: 1 } }).linhas).not.toBe(a.linhas)
    expect(hashesEspelho({ ...base, cfg: { ...base.cfg, start: '2026-01-12' } }, {}).linhas).not.toBe(a.linhas)
  })
})

describe('linhasDiferentes', () => {
  const l = (id: string, extra: Record<string, unknown> = {}) => ({ meta_id: id, horas: 1, detalhes: { b: 1, a: 2 }, ...extra })
  it('ignora iguais (inclusive jsonb com ordem de chaves diferente) e devolve novas/alteradas', () => {
    const ex = new Map<string, Record<string, unknown>>([
      ['a', { meta_id: 'a', horas: 1, detalhes: { a: 2, b: 1 }, atualizado_em: 'x' }],
      ['b', { meta_id: 'b', horas: 2, detalhes: { a: 2, b: 1 } }],
    ])
    const r = linhasDiferentes([l('a'), l('b'), l('c')], ex)
    expect(r.map((x) => x.meta_id)).toEqual(['b', 'c'])
  })
  it('coluna ausente no existente (migração pendente) não força upsert', () => {
    const ex = new Map<string, Record<string, unknown>>([['a', { meta_id: 'a', horas: 1 }]])
    expect(linhasDiferentes([l('a')], ex)).toEqual([])
  })
})
