import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/cache/relatorio-cache', () => ({ remember: async (_k: string, _t: number, f: () => Promise<unknown>) => f(), esquecer: async () => {} }))
const audits: unknown[] = []
vi.mock('@/lib/audit', () => ({ registrarAudit: async (a: unknown) => { audits.push(a) } }))

import { lerRegistroOverlay, salvarOverlay } from './overlay-server'
import { aplicarRegrasUsuarioDoTenant } from '../../cronograma/adaptativo/regras-usuario-server'
import { REGRAS_PADRAO } from '../../cronograma/adaptativo/regras'
import { adicionarNo, conectar, editarNoUsuario, overlayVazio } from './overlay'

/** Supabase falso: uma linha em simulado_fluxo_overlays + versões; `ausente` simula tabela inexistente (migração não aplicada). */
function fakeSvc(opts: { ausente?: boolean } = {}) {
  const est = { linha: null as null | { versao: number; overlay: unknown; hash: string }, versoes: [] as unknown[] }
  const erroAusente = { code: '42P01', message: 'relation "simulado_fluxo_overlays" does not exist' }
  const from = (tabela: string) => {
    if (opts.ausente) return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: erroAusente }) }) }) }), insert: async () => ({ error: erroAusente }) }
    if (tabela === 'simulado_fluxo_overlay_versoes') return { insert: async (v: unknown) => { est.versoes.push(v); return { error: null } }, delete: () => ({ eq: () => ({ eq: () => ({ lte: async () => ({ error: null }) }) }) }) }
    return {
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: est.linha, error: null }) }) }) }),
      insert: async (v: { versao: number; overlay: unknown; hash: string }) => { if (est.linha) return { error: { code: '23505', message: 'dup' } }; est.linha = v; return { error: null } },
      update: (v: { versao: number; overlay: unknown; hash: string }) => {
        const f: Array<[string, unknown]> = []
        const q: any = { eq: (k: string, x: unknown) => { f.push([k, x]); return q }, select: async () => { const ver = f.find(([k]) => k === 'versao')?.[1]; if (!est.linha || est.linha.versao !== ver) return { data: [], error: null }; est.linha = v; return { data: [{ versao: v.versao }], error: null } } }
        return q
      },
    }
  }
  return { svc: { from } as never, est }
}

const comRegra = () => {
  const c = adicionarNo(overlayVazio(), 'condicao', 'd', 0, 0)
  const a = adicionarNo(c.overlay, 'acao', 'd', 0, 0)
  const cc = editarNoUsuario(a.overlay, c.id, { condicao: { ou: [[{ variavel: 'dia_semana', op: 'igual', valor: [0] }]] } })
  const aa = editarNoUsuario(cc, a.id, { acao: { tipo: 'bloquear', tipoA: 'fl' } })
  return conectar(aa, 'd', c.id, a.id, 'sim').overlay
}

describe('overlay-server: persistência versionada e tolerância', () => {
  it('sem tabela: overlay vazio, tabelaOk=false, motor com as regras base (mesma referência)', async () => {
    const { svc } = fakeSvc({ ausente: true })
    const r = await lerRegistroOverlay(svc, 't1', 'cronograma-adaptativo')
    expect(r.tabelaOk).toBe(false)
    expect(r.overlay).toEqual(overlayVazio())
    expect(await aplicarRegrasUsuarioDoTenant(svc, 't1', REGRAS_PADRAO)).toBe(REGRAS_PADRAO)
    const s = await salvarOverlay(svc, 't1', 'cronograma-adaptativo', overlayVazio(), 0, 'u1')
    expect(s).toMatchObject({ ok: false, tabelaAusente: true })
  })
  it('sem linha: overlay vazio e regras base inalteradas', async () => {
    const { svc } = fakeSvc()
    expect((await lerRegistroOverlay(svc, 't1', 'x')).versao).toBe(0)
    expect(await aplicarRegrasUsuarioDoTenant(svc, 't1', REGRAS_PADRAO)).toBe(REGRAS_PADRAO)
  })
  it('salva (v1), guarda histórico, audita, recusa versão velha e passa a alterar as regras do motor', async () => {
    const { svc, est } = fakeSvc()
    const o = comRegra()
    const s1 = await salvarOverlay(svc, 't1', 'cronograma-adaptativo', o, 0, 'u1', 'primeira')
    expect(s1).toMatchObject({ ok: true, versao: 1 })
    expect(est.versoes).toHaveLength(1)
    expect(audits).toHaveLength(1)
    const conflito = await salvarOverlay(svc, 't1', 'cronograma-adaptativo', o, 0, 'u2')
    expect(conflito).toMatchObject({ ok: false, conflito: true })
    const s2 = await salvarOverlay(svc, 't1', 'cronograma-adaptativo', o, 1, 'u1', 'segunda')
    expect(s2).toMatchObject({ ok: true, versao: 2 })
    const ef = await aplicarRegrasUsuarioDoTenant(svc, 't1', REGRAS_PADRAO)
    expect(ef).not.toBe(REGRAS_PADRAO)
    expect(ef.restricoes).toHaveLength(1)
    expect(ef.restricoes[0]).toMatchObject({ tipo: 'max_por_dia', tipoA: 'fl', valor: 0, dias: [0] })
  })
})
