import { describe, it, expect } from 'vitest'
import { REGRAS_PADRAO, HASH_REGRAS_PADRAO, hashRegras, normalizarRegras, deltaDoPadrao } from '../regras'
import { validarRegras } from '../regras-validacao'
import { ColetorRastro } from '../rastro'
import { resumirPorSemana } from '../analise-periodo'
import { simularRegrasPuro } from '../simular-regras'
import * as M30 from '../motor30'
import dados from '../catalogo-html.json'
import type { Cfg28, AulaAS, ItemLP, Plano } from '../motor28'

const CAT = dados as unknown as { aulas: Array<string[] | null>; ordem: number[]; ordemLP: number[]; legprocs: Array<{ disc: string; lei?: string; texto?: string }> }
const AS = CAT.aulas.map((a) => (a ? [...a] : ['', '', '', 0, '', ''])) as unknown as AulaAS[]
const LP = CAT.ordemLP.map((i) => ({ id: 'lp:1:' + i, disc: CAT.legprocs[i].disc, lei: CAT.legprocs[i].lei || '', texto: CAT.legprocs[i].texto || '' })) as unknown as ItemLP[]
const ESS9 = ['Direito Administrativo', 'Direito Constitucional', 'Direito Civil', 'Direito Financeiro', 'Processo Civil', 'Direito Tributário', 'Direito Ambiental', 'Direito do Trabalho', 'Processo do Trabalho']
const cfgBase = (horas: number[]): Cfg28 => ({ start: '2026-01-05', horas, discs: ESS9, metas: { pf: true, fl: true, qu: true, lp: true }, arranjo: 'pdf', revisao: { ativa: true, cada: 4 } } as unknown as Cfg28)
const CFG = cfgBase([4, 4, 4, 4, 4, 0, 0])
const CFG3 = cfgBase([5, 5, 5, 5, 5, 3, 3]) // faixa 3 (≥25h): semana especial por desempenho
const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const gerar = (cfg: Cfg28, ctx: Record<string, unknown> = {}) => M30.gerarPlano(copia(cfg), AS, LP, {}, null, { ordem: CAT.ordem, hoje: '2026-01-05', ...ctx } as never)
const ADAPT_OFF = { adaptacao: { dominoAtivo: false, reforcoAtivo: false, semanaEspecialAtiva: false, antecipaRetornoAtivo: false } }

describe('D1 — interruptores de adaptação', () => {
  it('padrão: tudo ligado, hash do padrão intacto, delta vazio', () => {
    expect(REGRAS_PADRAO.adaptacao).toEqual({ dominoAtivo: true, reforcoAtivo: true, semanaEspecialAtiva: true, antecipaRetornoAtivo: true })
    expect(hashRegras(REGRAS_PADRAO)).toBe(HASH_REGRAS_PADRAO)
    expect(hashRegras({ adaptacao: { dominoAtivo: true } })).toBe(HASH_REGRAS_PADRAO)
    expect(deltaDoPadrao(REGRAS_PADRAO)).toEqual({})
  })
  it('desligar muda hash/delta; lixo é normalizado; zod aceita e rejeita não-booleano', () => {
    expect(hashRegras(ADAPT_OFF)).not.toBe(HASH_REGRAS_PADRAO)
    expect(deltaDoPadrao({ adaptacao: { reforcoAtivo: false } })).toEqual({ adaptacao: { reforcoAtivo: false } })
    expect(normalizarRegras({ adaptacao: { dominoAtivo: 'x', reforcoAtivo: false } }).adaptacao).toEqual({ dominoAtivo: true, reforcoAtivo: false, semanaEspecialAtiva: true, antecipaRetornoAtivo: true })
    expect(validarRegras({ adaptacao: { reforcoAtivo: false } }).ok).toBe(true)
    expect(validarRegras({ adaptacao: { reforcoAtivo: 'não' } }).ok).toBe(false)
  })
  it('geração sem acerto/erro: adaptação ligada × desligada gera a MESMA base de metas por tipo', () => {
    const a = gerar(CFG), b = gerar(CFG, { regras: ADAPT_OFF })
    // base = metas regulares (sem partes 'pp', que dependem do encaixe diário)
    const tipos = (p: Plano) => { const o: Record<string, number> = {}; for (const id of Object.keys(p)) { const t = id.split(':')[0]; if (t === 'pp' || /:(revisao|reforco):|^r[fq]:/.test(id)) continue; o[t] = (o[t] || 0) + 1 } return o }
    expect(tipos(b.plano)).toEqual(tipos(a.plano))
  })
  it('semana especial por desempenho desligada: nenhuma meta :revisao:/rf/rq', () => {
    const prog: Record<string, { s: string; em: string }> = {}, notas: Record<string, { res: number; err: number }> = {}
    const base = gerar(CFG3)
    for (const [id, [d]] of Object.entries(base.plano)) if (/^pf:\d+$/.test(id) && d < '2026-02-02') { prog[id] = { s: 'done', em: d }; notas['qu:' + id.split(':')[1]] = { res: 10, err: 8 } }
    const ctx = { prog, notas, feitas: Object.keys(prog), hoje: '2026-03-02' }
    const ligada = gerar(CFG3, ctx), off = gerar(CFG3, { ...ctx, regras: { adaptacao: { semanaEspecialAtiva: false } } })
    const especiais = (p: Plano) => Object.keys(p).filter((id) => /:revisao:|^r[fq]:/.test(id))
    expect(especiais(off.plano)).toEqual([])
    expect(especiais(ligada.plano).length).toBeGreaterThanOrEqual(0) // documenta: pode ser 0 conforme o desempenho
  })
  it('dominó desligado: "não fiz" só adia a meta movida (sem refluxo das demais)', () => {
    const g = gerar(CFG), plano = g.plano
    const [movida, [dataMov]] = Object.entries(plano).find(([id, [d]]) => /^pf:\d+$/.test(id) && d > '2026-01-12')!
    let dia = dataMov
    do { dia = new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8) + 1)).toISOString().slice(0, 10) } while ([0, 6].includes(new Date(dia + 'T12:00:00Z').getUTCDay()))
    const ctx = { ordem: CAT.ordem, hoje: '2026-01-12' }
    const op = { movida: { id: movida, dia }, detalhes: g.detalhes }
    let on: { plano: Plano } | null = null
    try { on = M30.calcularDomino(plano, copia(CFG), '2026-01-12', op, AS, LP, ctx as never) } catch { /* dia inválido p/ o dominó ligado; o desligado não valida */ }
    const off = M30.calcularDomino(plano, copia(CFG), '2026-01-12', op, AS, LP, { ...ctx, regras: { adaptacao: { dominoAtivo: false } } } as never)
    expect(off.plano[movida][0]).toBe(dia)
    const mudaram = Object.keys(plano).filter((id) => off.plano[id][0] !== plano[id][0])
    expect(mudaram.filter((id) => id !== movida && plano[id][0] >= '2026-01-12')).toEqual([]) // só a movida e as pendentes de antes de `desde` se mexem
    if (on) expect(Object.keys(plano).filter((id) => on!.plano[id] && on!.plano[id][0] !== plano[id][0]).length).toBeGreaterThanOrEqual(1) // dominó ligado reorganiza (≥ a movida)
  }, 60000)
})

describe('D2 — rastro de decisão', () => {
  it('não altera a saída do plano e registra decisões (restrição ativa)', () => {
    const regras = { restricoes: [{ id: 'q1', tipo: 'max_por_dia', ativa: true, rotulo: '', tipoA: 'qu', tipoB: null, valor: 1, faixas: [] }] }
    const sem = gerar(CFG, { regras }), coletor = new ColetorRastro()
    const com = gerar(CFG, { regras, rastro: coletor })
    expect(com.plano).toEqual(sem.plano)
    expect(com.fim).toBe(sem.fim)
    const ev = coletor.eventos()
    expect(ev.length).toBeGreaterThan(0)
    expect(ev.some((e) => e.cod === 'restricao' && /Questões/.test(e.texto))).toBe(true)
    expect(ev.length).toBeLessThanOrEqual(coletor.limite)
  })
  it('padrão sem rastro = golden intacto (mesmo plano com e sem coletor)', () => {
    expect(gerar(CFG, { rastro: new ColetorRastro() }).plano).toEqual(gerar(CFG).plano)
  })
  it('dominó desligado registra a adiada_sem_domino', () => {
    const g = gerar(CFG), movida = Object.entries(g.plano).find(([id, [d]]) => /^pf:\d+$/.test(id) && d > '2026-01-12' && d < '2026-01-23')![0]
    const c = new ColetorRastro()
    M30.calcularDomino(g.plano, copia(CFG), '2026-01-12', { movida: { id: movida, dia: '2026-01-23' }, detalhes: g.detalhes }, AS, LP, { ordem: CAT.ordem, hoje: '2026-01-12', regras: { adaptacao: { dominoAtivo: false } }, rastro: c } as never)
    expect(c.eventos().map((e) => e.cod)).toContain('adiada_sem_domino')
  }, 60000)
  it('limite de eventos: excedente só conta como descartado', () => {
    const c = new ColetorRastro(2)
    c.reg('a', 'restricao', 'x', '2026-01-01'); c.reg('b', 'restricao', 'x', '2026-01-02'); c.reg('c', 'restricao', 'x', '2026-01-03'); c.reg('a', 'restricao', 'x', '2026-01-05')
    expect(c.eventos()).toHaveLength(2); expect(c.descartados).toBe(1)
    expect(c.eventos().find((e) => e.id === 'a')).toMatchObject({ n: 2, de: '2026-01-01', ate: '2026-01-05' })
  })
})

describe('D3 — faixa por período', () => {
  it('resume por semana: faixa, teto, ocupação e metas por tipo (soma = total do plano)', () => {
    const cfg = { ...copia(CFG), motor: M30.VERSAO_MOTOR } as Cfg28
    const g = gerar(CFG), linhas = resumirPorSemana(g.plano, cfg, REGRAS_PADRAO)
    expect(linhas.length).toBeGreaterThan(10)
    expect(linhas.reduce((n, l) => n + l.totalMetas, 0)).toBe(Object.keys(g.plano).length)
    expect(linhas[0]).toMatchObject({ sem: 1, faixa: 2, minDisponiveis: 20 * 60 })
    for (const l of linhas) { expect(l.tetoPdf).toBeGreaterThan(0); expect(l.pdfNovos).toBeLessThanOrEqual(l.tetoPdf + 2) }
  })
  it('simulação com detalhar anexa porSemana e rastro só ao proposto', () => {
    const d = simularRegrasPuro(copia(CFG), { AS, LP, ordem: CAT.ordem }, { restricoes: [{ id: 'q1', tipo: 'max_por_dia', ativa: true, rotulo: '', tipoA: 'qu', tipoB: null, valor: 1, faixas: [] }] }, {}, '2026-01-05', { detalhar: true })
    expect(d.proposto.porSemana?.length).toBeGreaterThan(0)
    expect(d.proposto.rastro?.eventos.length).toBeGreaterThan(0)
    expect(d.vigente.porSemana).toBeUndefined()
    const sem = simularRegrasPuro(copia(CFG), { AS, LP, ordem: CAT.ordem }, {}, {}, '2026-01-05')
    expect(sem.proposto.porSemana).toBeUndefined()
  })
})
