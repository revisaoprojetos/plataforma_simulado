import { describe, it, expect } from 'vitest'
import { REGRAS_PADRAO, HASH_REGRAS_PADRAO, hashRegras, normalizarRegras, deltaDoPadrao, type RestricaoRegra } from '../regras'
import { validarRegras } from '../regras-validacao'
import { restricaoBloqueia, detectarConflitosRestricoes, EXEMPLOS_RESTRICOES, somaDiasISO } from '../restricoes'
import { verificarInvariantes } from '../invariantes'
import * as M30 from '../motor30'
import dados from '../catalogo-html.json'
import type { Cfg28, AulaAS, ItemLP, Plano } from '../motor28'

const CAT = dados as unknown as { aulas: Array<string[] | null>; ordem: number[]; ordemLP: number[]; legprocs: Array<{ disc: string; lei?: string; texto?: string }> }
const AS = CAT.aulas.map((a) => (a ? [...a] : ['', '', '', 0, '', ''])) as unknown as AulaAS[]
const LP = CAT.ordemLP.map((i) => ({ id: 'lp:1:' + i, disc: CAT.legprocs[i].disc, lei: CAT.legprocs[i].lei || '', texto: CAT.legprocs[i].texto || '' })) as unknown as ItemLP[]
const ESS9 = ['Direito Administrativo', 'Direito Constitucional', 'Direito Civil', 'Direito Financeiro', 'Processo Civil', 'Direito Tributário', 'Direito Ambiental', 'Direito do Trabalho', 'Processo do Trabalho']
const base = (o: Record<string, unknown> = {}): Cfg28 => ({ start: '2026-01-05', horas: [4, 4, 4, 4, 4, 0, 0], discs: ESS9, metas: { pf: true, fl: true, qu: true, lp: true }, arranjo: 'pdf', revisao: { ativa: true, cada: 8 }, ...o }) as unknown as Cfg28
const gerar = (cfg: Cfg28, restricoes?: Array<Partial<RestricaoRegra>>) =>
  M30.gerarPlano(JSON.parse(JSON.stringify(cfg)), AS, LP, {}, null, { ordem: CAT.ordem, hoje: '2026-01-05', ...(restricoes ? { regras: { restricoes } as never } : {}) })
const r = (o: Partial<RestricaoRegra> & Pick<RestricaoRegra, 'tipo' | 'tipoA'>): RestricaoRegra => ({ id: 'r1', ativa: true, rotulo: '', tipoB: null, valor: 1, faixas: [], ...o })

const fam = (id: string) => ({ pp: 'pf', rf: 'fl', rq: 'qu' } as Record<string, string>)[id.split(':')[0]] ?? id.split(':')[0]
const porDia = (p: Plano) => { const m = new Map<string, string[]>(); for (const [id, [d]] of Object.entries(p)) m.set(d, [...(m.get(d) ?? []), id]); return m }
const CFG = base({ horas: [4, 4, 4, 4, 4, 0, 0] })

describe('restrições: normalização, hash e padrão vazio', () => {
  it('padrão = vazio; hash do padrão não muda por causa do campo novo', () => {
    expect(REGRAS_PADRAO.restricoes).toEqual([])
    expect(hashRegras(REGRAS_PADRAO)).toBe(HASH_REGRAS_PADRAO)
    expect(hashRegras({ restricoes: [] })).toBe(HASH_REGRAS_PADRAO)
    expect(deltaDoPadrao(REGRAS_PADRAO)).toEqual({})
  })
  it('descarta lixo e clampa valores', () => {
    const n = normalizarRegras({ restricoes: [{ tipo: 'xx', tipoA: 'pf' }, { tipo: 'max_por_dia', tipoA: 'qu', valor: 99, faixas: [2, 9] }, { tipo: 'nao_mesmo_dia', tipoA: 'pf' }, 7] })
    expect(n.restricoes).toHaveLength(1)
    expect(n.restricoes[0]).toMatchObject({ tipo: 'max_por_dia', tipoA: 'qu', valor: 6, faixas: [2], ativa: true })
  })
  it('restrição entra no delta e no hash', () => {
    const regras = { restricoes: [r({ tipo: 'nao_dias_seguidos', tipoA: 'fl' })] }
    expect(Object.keys(deltaDoPadrao(regras))).toEqual(['restricoes'])
    expect(hashRegras(regras)).not.toBe(HASH_REGRAS_PADRAO)
  })
})

describe('restrições: validação (zod, pt-BR)', () => {
  it('aceita exemplos prontos; rejeita incoerências com mensagem', () => {
    expect(validarRegras({ restricoes: EXEMPLOS_RESTRICOES.map((e) => ({ ...e, ativa: true })) }).ok).toBe(true)
    const a = validarRegras({ restricoes: [r({ tipo: 'nao_mesmo_dia', tipoA: 'pf', tipoB: 'pf' })] })
    expect(a.ok).toBe(false); expect(a.erros[0]).toMatch(/dele mesmo/)
    const b = validarRegras({ restricoes: [r({ tipo: 'so_na_sobra', tipoA: 'pf' })] })
    expect(b.ok).toBe(false); expect(b.erros.join(' ')).toMatch(/PDFull/)
    const c = validarRegras({ restricoes: [r({ id: 'a', tipo: 'depois_de', tipoA: 'qu', tipoB: 'fl' }), r({ id: 'b', tipo: 'depois_de', tipoA: 'fl', tipoB: 'qu' })] })
    expect(c.ok).toBe(false); expect(c.erros.join(' ')).toMatch(/circular/)
    const d = validarRegras({ restricoes: [{ id: 'x', tipo: 'max_por_dia', tipoA: 'qu', tipoB: null, ativa: true, rotulo: '', valor: 0, faixas: [] }] })
    expect(d.ok).toBe(false); expect(d.erros.join(' ')).toMatch(/mínimo 1/)
  })
  it('conflito detectável vira aviso: "A não com B" + "A depois de B (0)"', () => {
    const c = detectarConflitosRestricoes([r({ id: 'a', tipo: 'nao_mesmo_dia', tipoA: 'qu', tipoB: 'fl' }), r({ id: 'b', tipo: 'depois_de', tipoA: 'qu', tipoB: 'fl', valor: 0 })])
    expect(c.erros).toEqual([])
    expect(c.avisos.join(' ')).toMatch(/dia seguinte/)
    expect(detectarConflitosRestricoes([r({ tipo: 'nao_mesmo_dia', tipoA: 'qu', tipoB: 'fl', ativa: false }), r({ id: 'b', tipo: 'depois_de', tipoA: 'qu', tipoB: 'fl', valor: 0 })]).avisos).toEqual([])
  })
})

describe('restricaoBloqueia (função pura)', () => {
  const ctx = (plano: Record<string, string>, faixa = 2) => {
    const dias = new Map<string, string[]>(); for (const [id, d] of Object.entries(plano)) dias.set(d, [...(dias.get(d) ?? []), id])
    return { idsDoDia: (d: string) => dias.get(d) ?? [], dataDe: (id: string) => plano[id], faixa, pai: (id: string) => (id.startsWith('pp:') ? 'pf:' + id.split(':')[1] : id), haOutrosPendentes: () => true }
  }
  it('sem restrições nunca bloqueia', () => expect(restricaoBloqueia([], 'fl:1', '2026-01-05', ctx({ 'fl:2': '2026-01-05' }))).toBe(false))
  it('max por dia', () => {
    const rs = [r({ tipo: 'max_por_dia', tipoA: 'qu', valor: 1 })]
    expect(restricaoBloqueia(rs, 'qu:2', '2026-01-05', ctx({ 'qu:1': '2026-01-05' }))).toBe(true)
    expect(restricaoBloqueia(rs, 'qu:2', '2026-01-06', ctx({ 'qu:1': '2026-01-05' }))).toBe(false)
  })
  it('não no mesmo dia é simétrico', () => {
    const rs = [r({ tipo: 'nao_mesmo_dia', tipoA: 'pf', tipoB: 'fl' })]
    expect(restricaoBloqueia(rs, 'pf:3', '2026-01-05', ctx({ 'fl:1': '2026-01-05' }))).toBe(true)
    expect(restricaoBloqueia(rs, 'fl:1', '2026-01-05', ctx({ 'pp:3:1': '2026-01-05' }))).toBe(true)
    expect(restricaoBloqueia(rs, 'qu:1', '2026-01-05', ctx({ 'fl:1': '2026-01-05' }))).toBe(false)
  })
  it('não em dias seguidos (partes do mesmo PDFull são exceção)', () => {
    expect(restricaoBloqueia([r({ tipo: 'nao_dias_seguidos', tipoA: 'fl' })], 'fl:2', '2026-01-06', ctx({ 'fl:1': '2026-01-05' }))).toBe(true)
    expect(restricaoBloqueia([r({ tipo: 'nao_dias_seguidos', tipoA: 'fl' })], 'fl:2', '2026-01-07', ctx({ 'fl:1': '2026-01-05' }))).toBe(false)
    expect(restricaoBloqueia([r({ tipo: 'nao_dias_seguidos', tipoA: 'pf' })], 'pp:4:2', '2026-01-06', ctx({ 'pp:4:1': '2026-01-05' }))).toBe(false)
  })
  it('só na sobra e depois de; escopo por faixa', () => {
    expect(restricaoBloqueia([r({ tipo: 'so_na_sobra', tipoA: 'lp' })], 'lp:1:1', '2026-01-05', ctx({}))).toBe(true)
    expect(restricaoBloqueia([r({ tipo: 'so_na_sobra', tipoA: 'lp' })], 'lp:1:1', '2026-01-05', ctx({ 'pf:1': '2026-01-05' }))).toBe(false)
    const dep = [r({ tipo: 'depois_de', tipoA: 'qu', tipoB: 'fl', valor: 2 })]
    expect(restricaoBloqueia(dep, 'qu:5', somaDiasISO('2026-01-05', 1), ctx({ 'fl:5': '2026-01-05' }))).toBe(true)
    expect(restricaoBloqueia(dep, 'qu:5', somaDiasISO('2026-01-05', 2), ctx({ 'fl:5': '2026-01-05' }))).toBe(false)
    expect(restricaoBloqueia([r({ tipo: 'max_por_dia', tipoA: 'qu', valor: 1, faixas: [3] })], 'qu:2', '2026-01-05', ctx({ 'qu:1': '2026-01-05' }, 2))).toBe(false)
  })
})

describe('restrições no motor (sensibilidade)', () => {
  const padrao = gerar(CFG)
  it('lista vazia ou tudo desligado = plano idêntico ao padrão', () => {
    expect(gerar(CFG, []).plano).toEqual(padrao.plano)
    expect(gerar(CFG, EXEMPLOS_RESTRICOES.map((e) => ({ ...e }))).plano).toEqual(padrao.plano)
  })
  it('padrão tem os dois padrões que as restrições vão proibir (prova de sensibilidade)', () => {
    const d = porDia(padrao.plano)
    expect([...d.values()].some((ids) => ids.filter((k) => fam(k) === 'qu').length >= 2)).toBe(true)
  })
  it('max 1 questão/dia altera o plano e é respeitado', () => {
    const g = gerar(CFG, [r({ tipo: 'max_por_dia', tipoA: 'qu', valor: 1 })])
    expect(g.plano).not.toEqual(padrao.plano)
    for (const ids of porDia(g.plano).values()) expect(ids.filter((k) => fam(k) === 'qu').length).toBeLessThanOrEqual(1)
  })
  it('PDFull não no mesmo dia que Questões altera o plano e é respeitado', () => {
    const g = gerar(CFG, [r({ tipo: 'nao_mesmo_dia', tipoA: 'pf', tipoB: 'qu' })])
    expect(g.plano).not.toEqual(padrao.plano)
    for (const ids of porDia(g.plano).values()) expect(ids.some((k) => fam(k) === 'pf') && ids.some((k) => fam(k) === 'qu')).toBe(false)
  })
  it('sem 2 dias seguidos de PDFlash altera o plano e é respeitado', () => {
    const g = gerar(CFG, [r({ tipo: 'nao_dias_seguidos', tipoA: 'fl' })])
    expect(g.plano).not.toEqual(padrao.plano)
    const dias = [...porDia(g.plano).entries()].filter(([, ids]) => ids.some((k) => fam(k) === 'fl')).map(([d]) => d)
    for (const d of dias) expect(dias.includes(somaDiasISO(d, 1))).toBe(false)
  })
  it('LegProc só na sobra altera o plano', () => {
    const g = gerar(CFG, [r({ tipo: 'so_na_sobra', tipoA: 'lp' })])
    expect(g.plano).not.toEqual(padrao.plano)
  })
  it('Questões ≥3 dias depois do PDFlash altera o plano e é respeitado', () => {
    const g = gerar(CFG, [r({ tipo: 'depois_de', tipoA: 'qu', tipoB: 'fl', valor: 3 })])
    expect(g.plano).not.toEqual(padrao.plano)
    for (const [id, [d]] of Object.entries(g.plano)) { const m = /^qu:(\d+)$/.exec(id); if (m && g.plano['fl:' + m[1]]) expect(d >= somaDiasISO(g.plano['fl:' + m[1]][0], 3)).toBe(true) }
  })
  it('escopo por faixa: restrição da faixa 3 não afeta rotina da faixa 2 (20h)', () => {
    expect(gerar(CFG, [r({ tipo: 'max_por_dia', tipoA: 'qu', valor: 1, faixas: [3] })]).plano).toEqual(padrao.plano)
  })
})

describe('verificarInvariantes', () => {
  const ctx = { start: CFG.start, horasDia: (d: string) => M30.horasDia(CFG, d), AS, ordem: CAT.ordem }
  it('plano do motor com regras padrão: sem violações das invariantes 1, 2, 3 e 5', () => {
    const v = verificarInvariantes(padraoPlano(), undefined, ctx).filter((x) => x.invariante !== 4)
    expect(v).toEqual([])
  })
  it('detecta violações plantadas', () => {
    const p: Plano = { 'pf:1': ['2026-01-05', 3], 'pf:2': ['2026-01-05', 3], 'pf:3': ['2026-01-05', 1], 'fl:1': ['2026-01-04', 1], 'pp:9:1': ['2026-01-05', 1], 'pf:9': ['2026-01-20', 1] }
    const v = verificarInvariantes(p, undefined, ctx)
    const inv = new Set(v.map((x) => x.invariante))
    expect(inv.has(1)).toBe(true) // 8h em dia de 4h; domingo/folga recebeu meta
    expect(inv.has(2)).toBe(true) // PDFull 9 atravessa semanas
    expect(inv.has(3)).toBe(true) // 3 PDFulls distintos no dia
    expect(inv.has(5)).toBe(true) // fl:1 antes da leitura
  })
  it('restrição ativa violada aparece como violação 0; desligada não', () => {
    const p: Plano = { 'pf:1': ['2026-01-05', 2], 'qu:7': ['2026-01-05', 0.5] }
    const ativa = [r({ id: 'x', tipo: 'nao_mesmo_dia', tipoA: 'pf', tipoB: 'qu', rotulo: 'PDFull sem Questões' })]
    expect(verificarInvariantes(p, { restricoes: ativa }).filter((x) => x.invariante === 0)).toHaveLength(1)
    expect(verificarInvariantes(p, { restricoes: [{ ...ativa[0], ativa: false }] }).filter((x) => x.invariante === 0)).toHaveLength(0)
  })
  it('plano gerado COM restrição ativa não viola a restrição', () => {
    const rs = [r({ tipo: 'nao_dias_seguidos', tipoA: 'fl' }), r({ id: 'r2', tipo: 'max_por_dia', tipoA: 'qu', valor: 1 })]
    const g = gerar(CFG, rs)
    expect(verificarInvariantes(g.plano, { restricoes: rs }, ctx).filter((x) => x.invariante === 0)).toEqual([])
  })
})
function padraoPlano(): Plano { return gerar(CFG).plano }
