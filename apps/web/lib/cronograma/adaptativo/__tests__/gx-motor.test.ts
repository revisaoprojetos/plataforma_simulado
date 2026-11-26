import { describe, it, expect } from 'vitest'
import * as M30 from '../motor30'
import dados from '../catalogo-html.json'
import type { Cfg28, AulaAS, ItemLP, Plano } from '../motor28'
import type { ItemGX } from '../gx-tipos'
import { indiceAulaDaMeta, sanearDetalhes } from '../meta-ids'
import { metaDoAlvo } from '../meta-alvo'
import { ehSlugMeta, familiaDoTipo } from '../tipos-meta'
import { verificarInvariantes } from '../invariantes'

const CAT = dados as unknown as { aulas: Array<string[] | null>; ordem: number[]; ordemLP: number[]; legprocs: Array<{ disc: string; lei?: string; texto?: string }> }
const AS = CAT.aulas.map((a) => (a ? [...a] : ['', '', '', 0, '', ''])) as unknown as AulaAS[]
const LP = CAT.ordemLP.map((i) => ({ id: 'lp:1:' + i, disc: CAT.legprocs[i].disc, lei: CAT.legprocs[i].lei || '', texto: CAT.legprocs[i].texto || '' })) as unknown as ItemLP[]
const ESS9 = ['Direito Administrativo', 'Direito Constitucional', 'Direito Civil', 'Direito Financeiro', 'Processo Civil', 'Direito Tributário', 'Direito Ambiental', 'Direito do Trabalho', 'Processo do Trabalho']
const cfg = (o: Record<string, unknown> = {}): Cfg28 => ({ start: '2026-01-05', horas: [4, 4, 4, 4, 4, 0, 0], discs: ESS9, metas: { pf: true, fl: true, qu: true, lp: true }, arranjo: 'pdf', revisao: { ativa: true, cada: 8 }, ...o }) as unknown as Cfg28
const hoje = '2026-01-05'
const GX: ItemGX[] = [
  { id: 'gx:simulado:aaaa1111', slug: 'simulado', nomeTipo: 'Simulado', disc: 'Direito Civil', titulo: 'Simulado 1', doc: 'doc-1', min: 90, prioridade: 5, ordem: 1 },
  { id: 'gx:resumo:bbbb2222', slug: 'resumo', nomeTipo: 'Resumo', disc: 'Direito Civil', titulo: 'Resumo 1', doc: 'doc-2', min: 30, prioridade: 5, ordem: 0 },
]
const rodar = (fixos: Plano, ctx: Record<string, unknown> = {}, c = cfg()) =>
  M30.gerarPlano(JSON.parse(JSON.stringify(c)), AS, LP, JSON.parse(JSON.stringify(fixos)), hoje, { ordem: CAT.ordem, hoje, ...ctx })
const cap = (d: string) => { const dow = (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; return [4, 4, 4, 4, 4, 0, 0][dow] * 60 }
const gxIds = (p: Plano) => Object.keys(p).filter((k) => k.startsWith('gx:'))

describe('metas gx (tipos personalizados)', () => {
  it('byte-identidade: ctx.gx ausente = undefined = []', () => {
    const a = JSON.stringify(rodar({}))
    expect(JSON.stringify(rodar({}, { gx: undefined }))).toBe(a)
    expect(JSON.stringify(rodar({}, { gx: [] }))).toBe(a)
    expect(a).not.toContain('gx:')
  }, 120000)

  it('vocabulário puro: gx é slug/família e não é meta de aula', () => {
    expect(ehSlugMeta('gx')).toBe(true)
    expect(familiaDoTipo('gx')).toBe('gx')
    expect(indiceAulaDaMeta('gx:simulado:aaaa1111')).toBeNull()
    expect(metaDoAlvo('gx:simulado:aaaa1111', { k: 'a', i: 1 })).toBe(false)
    expect(metaDoAlvo('gx:simulado:aaaa1111', { k: 'gx', ids: ['gx:simulado:aaaa1111'] })).toBe(true)
    expect(Object.keys(sanearDetalhes({ 'gx:simulado:aaaa1111': { material: 'x' } }) || {})).toEqual(['gx:simulado:aaaa1111'])
  })

  it('agenda os itens, sem sobreposição de horas, ids estáveis e determinístico', () => {
    const r = rodar({}, { gx: GX })
    expect(gxIds(r.plano).sort()).toEqual(GX.map((x) => x.id).sort())
    for (const x of GX) expect(Math.round(r.plano[x.id][1] * 60)).toBe(x.min)
    const porDia = new Map<string, number>()
    for (const [d, h] of Object.values(r.plano)) porDia.set(d, (porDia.get(d) || 0) + Math.round(h * 60))
    for (const [d, m] of porDia) expect(m).toBeLessThanOrEqual(cap(d))
    expect(JSON.stringify(rodar({}, { gx: GX }))).toBe(JSON.stringify(r))
    expect(JSON.stringify(rodar({}, { gx: [...GX].reverse() }))).toBe(JSON.stringify(r))
    expect(verificarInvariantes(r.plano, undefined, { start: '2026-01-05', horasDia: (d) => cap(d) / 60 }).filter((v) => v.invariante === 1)).toEqual([])
  }, 120000)

  it('regenerar preserva as feitas e não reagenda duas vezes', () => {
    const base = rodar({}, { gx: GX })
    const feita = GX[0].id
    const fixos: Plano = { [feita]: [...base.plano[feita]] as [string, number] }
    const r = rodar(fixos, { gx: GX, feitas: [feita], prog: { [feita]: { s: 'done', em: base.plano[feita][0] } } })
    expect(r.plano[feita]).toEqual(base.plano[feita])
    expect(gxIds(r.plano).length).toBe(2)
  }, 120000)

  it('dominó/atraso: com o dia zerado, o gx pendente vai para dia posterior, respeitando a capacidade', () => {
    const base = rodar({}, { gx: GX })
    const alvo = GX[0].id, dia = base.plano[alvo][0]
    const c = cfg({ horasPontuais: { [dia]: 0 } })
    const r = M30.calcularDomino(base.plano, c, dia, { fixarComDado: true }, AS, LP, { ordem: CAT.ordem, hoje: dia, gx: GX })
    expect(r.plano[alvo]).toBeDefined()
    expect(r.plano[alvo][0] > dia).toBe(true)
    expect(Math.round(r.plano[alvo][1] * 60)).toBe(GX[0].min)
    const porDia = new Map<string, number>()
    for (const [d, h] of Object.values(r.plano)) porDia.set(d, (porDia.get(d) || 0) + Math.round(h * 60))
    for (const [d, m] of porDia) expect(m).toBeLessThanOrEqual(d === dia ? 0 : cap(d))
    expect(gxIds(r.plano).length).toBe(2)
  }, 120000)

  it('pendenciasGx lista só o que está sem data e fora das feitas', () => {
    expect(M30.pendenciasGx(cfg(), GX, { [GX[0].id]: ['2026-01-05', 1] }, [])).toEqual([GX[1].id])
    expect(M30.pendenciasGx(cfg(), GX, {}, [GX[1].id])).toEqual([GX[0].id])
  })

  describe('regras por tipo (tiposGx, fase 3a)', () => {
    const MUITOS: ItemGX[] = Array.from({ length: 12 }, (_, k) => ({ id: 'gx:resumo:r' + String(k).padStart(7, '0'), slug: 'resumo', nomeTipo: 'Resumo', disc: 'Direito Civil', titulo: 'R' + k, doc: 'd' + k, min: 30, prioridade: 5, ordem: k }))
    const com = (tiposGx: Record<string, unknown>, ctx: Record<string, unknown> = {}) => rodar({}, { gx: MUITOS, regras: { tiposGx }, ...ctx })
    const sem = (d: string) => Math.floor((new Date(d + 'T00:00:00Z').getTime() - new Date('2026-01-05T00:00:00Z').getTime()) / 86400000 / 7) + 1
    const dow = (d: string) => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7
    const cont = (p: Plano, f: (d: string) => string | number) => { const m = new Map<string | number, number>(); for (const id of gxIds(p)) { const k = f(p[id][0]); m.set(k, (m.get(k) || 0) + 1) } return m }
    const R0 = { ativo: true, maxPorDia: null, maxPorSemana: null, dias: [], faixas: [], aPartirDaSemana: 0 }

    it('byte-identidade: tiposGx vazio/ausente = sem regras', () => {
      const a = JSON.stringify(rodar({}, { gx: GX }))
      expect(JSON.stringify(rodar({}, { gx: GX, regras: { tiposGx: {} } }))).toBe(a)
      expect(JSON.stringify(rodar({}, { gx: GX, regras: { tiposGx: { resumo: R0 } } }))).toBe(a)
    }, 240000)

    it('maxPorDia e maxPorSemana', () => {
      const r = com({ resumo: { ...R0, maxPorDia: 1, maxPorSemana: 2 } })
      expect(gxIds(r.plano).length).toBe(12)
      for (const n of cont(r.plano, (d) => d).values()) expect(n).toBeLessThanOrEqual(1)
      for (const n of cont(r.plano, sem).values()) expect(n).toBeLessThanOrEqual(2)
      expect(verificarInvariantes(r.plano, { tiposGx: { resumo: { ...R0, maxPorDia: 1, maxPorSemana: 2 } } }, { start: '2026-01-05' })).toEqual([])
    }, 240000)

    it('dias e aPartirDaSemana; ids estáveis e determinístico', () => {
      const t = { resumo: { ...R0, dias: [2], aPartirDaSemana: 3 } }
      const r = com(t)
      expect(gxIds(r.plano).sort()).toEqual(MUITOS.map((x) => x.id).sort())
      for (const id of gxIds(r.plano)) { expect(dow(r.plano[id][0])).toBe(2); expect(sem(r.plano[id][0])).toBeGreaterThanOrEqual(3) }
      expect(JSON.stringify(com(t))).toBe(JSON.stringify(r))
    }, 240000)

    it('inativo ou faixa impossível: não agenda, não trava e fica pendente', () => {
      for (const t of [{ resumo: { ...R0, ativo: false } }, { resumo: { ...R0, faixas: [8] } }]) {
        const r = com(t)
        expect(gxIds(r.plano)).toEqual([])
        expect(M30.pendenciasGx(cfg(), MUITOS, r.plano, []).length).toBe(12)
      }
    }, 240000)

    it('só afeta o slug da regra: outro tipo segue na sobra', () => {
      const r = rodar({}, { gx: GX, regras: { tiposGx: { simulado: { ...R0, ativo: false } } } })
      expect(gxIds(r.plano)).toEqual([GX[1].id])
    }, 240000)
  })
})
