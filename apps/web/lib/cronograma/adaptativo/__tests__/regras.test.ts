import { describe, it, expect } from 'vitest'
import {
  REGRAS_PADRAO, HASH_REGRAS_PADRAO, normalizarRegras, resolverFaixa, resolverTetoPdf, resolverRegras, hashRegras, deltaDoPadrao, revisaoEmCiclo,
} from '../regras'
import { validarRegras } from '../regras-validacao'
import { TIPOS_META, SLUGS_META, rotuloTipo, ordemTipo, nomesAlunoPorSlug } from '../tipos-meta'
import { PARAMS_PADRAO } from '../params'
import * as M30 from '../motor30'
import dados from '../catalogo-html.json'
import type { Cfg28, AulaAS, ItemLP, Plano } from '../motor28'

// ── cenário com o catálogo de referência (mesmo do golden) ────────────────────────────────────────
const CAT = dados as unknown as { aulas: Array<string[] | null>; ordem: number[]; ordemLP: number[]; legprocs: Array<{ disc: string; lei?: string; texto?: string }> }
const AS = CAT.aulas.map((a) => (a ? [...a] : ['', '', '', 0, '', ''])) as unknown as AulaAS[]
const LP = CAT.ordemLP.map((i) => ({ id: 'lp:1:' + i, disc: CAT.legprocs[i].disc, lei: CAT.legprocs[i].lei || '', texto: CAT.legprocs[i].texto || '' })) as unknown as ItemLP[]
const ESS9 = ['Direito Administrativo', 'Direito Constitucional', 'Direito Civil', 'Direito Financeiro', 'Processo Civil', 'Direito Tributário', 'Direito Ambiental', 'Direito do Trabalho', 'Processo do Trabalho']
const base = (o: Record<string, unknown> = {}): Cfg28 => ({ start: '2026-01-05', horas: [4, 4, 4, 4, 4, 0, 0], discs: ESS9, metas: { pf: true, fl: true, qu: true, lp: true }, arranjo: 'pdf', revisao: { ativa: true, cada: 8 }, ...o }) as unknown as Cfg28
const gerar = (cfg: Cfg28, regras?: unknown, extra: Record<string, unknown> = {}) =>
  M30.gerarPlano(JSON.parse(JSON.stringify(cfg)), AS, LP, {}, null, { ordem: CAT.ordem, hoje: '2026-01-05', ...extra, ...(regras ? { regras: regras as never } : {}) })

/** PDFulls NOVOS por semana (1ª parte de cada aula; continuações, reforços e revisões não contam). */
function iniciosPorSemana(plano: Plano, start: string): Record<number, number> {
  const primeiros = new Map<number, string>()
  for (const [id, [d]] of Object.entries(plano)) {
    if (!/^pf:\d+$|^pp:\d+:\d+$/.test(id)) continue
    const i = +id.split(':')[1]
    if (!primeiros.has(i) || d < primeiros.get(i)!) primeiros.set(i, d)
  }
  const out: Record<number, number> = {}
  for (const d of primeiros.values()) { const s = M30.semDe(start, d); out[s] = (out[s] || 0) + 1 }
  return out
}

describe('REGRAS_PADRAO reproduz as constantes hard-coded da 3.2.0', () => {
  it('valores', () => {
    const R = REGRAS_PADRAO
    expect(R.horizonte.maxSemanas).toBe(600)
    expect(R.faixas.map((f) => [f.minMin, f.maxMin, f.tetoPdf, f.revisaoModo, f.modoQuestoes, f.equilibra])).toEqual([
      [0, 870, 3, 'ciclo', 'revisao', false], [871, 1470, 4, 'ciclo', 'revisao_pdf', false], [1471, 2100, 5, 'desempenho', 'livre', true], [2101, null, 6, 'desempenho', 'livre', false],
    ])
    expect(R.revisao.cicloSemanas).toBe(4)
    expect(R.revisao.opcoesNovas).toEqual([4, 6, 8])
    expect(R.revisao.padrao).toBe(8)
    expect(R.limitesDia).toMatchObject({ pdfDistintos: 2, revisoes: 2, questoes: 2 })
    expect(R.divisao.maxDatas).toBe(3)
    expect(R.legproc).toMatchObject({ metasDiaMax: 4, mesmaLei: 2, leisDistintas: 2 })
    expect(R.desempenho).toMatchObject({ historicoOkMin: 70, historicoFlashMin: 50, especialPdfAbaixo: 50, especialFlashAte: 70, acertoFracoPct: 60 })
    expect(R.retaFinal).toMatchObject({ semanaMinima: 1, limiarTetos: 2, limiarTetosApos: 4 })
    expect(R.juris).toMatchObject({ minSemanalMin: 870, diasPreferidos: [4, 5], exigeOptIn: true })
    expect(R.historico).toMatchObject({ metaSemanalBase: 2, metaSemanalAlta: 3, corteAltaMin: 1440 })
    expect(R.prioridades.porTipo).toMatchObject({ pf: 0, pp: 0, fl: 1, rf: 1, qu: 2, rq: 2, lp: 6, jp: 6 })
  })
  it('normalizarRegras(vazio) = padrão; resolverRegras sem ctx devolve o padrão', () => {
    expect(normalizarRegras(undefined)).toEqual(REGRAS_PADRAO)
    expect(normalizarRegras({})).toEqual(REGRAS_PADRAO)
    expect(normalizarRegras('lixo')).toEqual(REGRAS_PADRAO)
    expect(resolverRegras(null)).toBe(REGRAS_PADRAO)
    expect(resolverRegras({ regras: null })).toBe(REGRAS_PADRAO)
    expect(resolverRegras({ regras: {} })).toEqual(REGRAS_PADRAO)
  })
  it('hash estável e insensível à ordem das chaves', () => {
    expect(hashRegras(REGRAS_PADRAO)).toBe(HASH_REGRAS_PADRAO)
    expect(hashRegras({})).toBe(HASH_REGRAS_PADRAO)
    expect(hashRegras({ faixas: { faixa2AteMinInclusivo: 1470, faixa1AteMinExclusivo: 900 } })).toBe(HASH_REGRAS_PADRAO)
    expect(hashRegras({ limitesDia: { pdfDistintos: 1 } })).not.toBe(HASH_REGRAS_PADRAO)
  })
  it('deltaDoPadrao: padrão = {}; só o que mudou', () => {
    expect(deltaDoPadrao(REGRAS_PADRAO)).toEqual({})
    expect(deltaDoPadrao({ desempenho: { especialFlashAte: 60 } })).toEqual({ desempenho: { especialFlashAte: 60 } })
    expect(normalizarRegras(deltaDoPadrao({ limitesDia: { pdfDistintos: 1 } })).limitesDia.pdfDistintos).toBe(1)
  })
  it('params e catálogos usam o registro único de tipos', () => {
    expect([PARAMS_PADRAO.durFl, PARAMS_PADRAO.durQu, PARAMS_PADRAO.durLp, PARAMS_PADRAO.durRf, PARAMS_PADRAO.durRq, PARAMS_PADRAO.jurisprudenciaMin]).toEqual([60, 30, 30, 60, 30, 60])
    expect([PARAMS_PADRAO.offsetRevisao, PARAMS_PADRAO.offsetQuestoes]).toEqual([1, 2])
    expect(SLUGS_META).toEqual(['pf', 'pp', 'fl', 'qu', 'lp', 'rf', 'rq', 'jp', 'gx'])
    expect(rotuloTipo('rf')).toBe('Revisão PDFlash')
    expect(rotuloTipo('xx')).toBeNull()
    expect(ordemTipo('lp')).toBe(3)
    expect(ordemTipo('zz')).toBe(9)
    expect(nomesAlunoPorSlug()).toMatchObject({ pf: 'PDFULL', fl: 'Revisão', qu: 'Questões', lp: 'LegProc', jp: 'Jurisprudência' })
    expect(TIPOS_META.fl.familia).toBe('fl')
  })
})

describe('resolverFaixa / resolverTetoPdf nas fronteiras exatas', () => {
  it('faixas: <15h → 1 · ≤24h30 → 2 · acima → 3', () => {
    expect(resolverFaixa(0)).toBe(1)
    expect(resolverFaixa(600)).toBe(1)
    expect(resolverFaixa(870)).toBe(1)
    // 871–899 min não existem na prática (a rotina é em blocos de 30 min): a 1ª faixa vai até 14h30 (870) e a 2ª começa em 15h
    expect(resolverFaixa(900)).toBe(2)
    expect(resolverFaixa(1469)).toBe(2)
    expect(resolverFaixa(1470)).toBe(2)
    expect(resolverFaixa(1471)).toBe(3)
    expect(resolverFaixa(1500)).toBe(3)
    expect(resolverFaixa(2100)).toBe(3)
    expect(resolverFaixa(5000)).toBe(3)
  })
  it('faixas respeitam regras customizadas', () => {
    // formato legado (objeto de fronteiras + tetosPdf) continua aceito e é convertido para a lista de faixas
    const R = normalizarRegras({ tetosPdf: [{ ateMin: 1199 }, { ateMin: 1800 }, { ateMin: 2400 }, {}], faixas: { faixa1AteMinExclusivo: 1200, faixa2AteMinInclusivo: 1800 } })
    expect(resolverFaixa(1199, R)).toBe(1)
    expect(resolverFaixa(1200, R)).toBe(2)
    expect(resolverFaixa(1800, R)).toBe(2)
    expect(resolverFaixa(1801, R)).toBe(3)
  })
  it('teto de PDFulls novos: 3/4/5/6 com cortes 14h30 · 24h30 · 35h (rev. 23); em plano 3.1 a 1ª linha é pulada', () => {
    const t = (m: number, r23 = true) => resolverTetoPdf(m, r23).teto
    expect([t(600), t(870)]).toEqual([3, 3])
    expect([t(871), t(900), t(1470)]).toEqual([4, 4, 4])
    expect([t(1471), t(1500), t(2100)]).toEqual([5, 5, 5])
    expect([t(2101), t(3000)]).toEqual([6, 6])
    expect([t(600, false), t(870, false), t(1470, false)]).toEqual([4, 4, 4])
    expect(resolverTetoPdf(1500, true).equilibra).toBe(true)
    expect(resolverTetoPdf(1470, true).equilibra).toBe(false)
  })
  it('motor: rotina300/tetoPDF300 usam as regras (cfg 3.2 vs 3.1)', () => {
    const cfg = (h: number[], motor = M30.VERSAO_MOTOR) => ({ ...base({ horas: h }), motor }) as Cfg28
    expect(M30.rotina300(cfg([2, 2, 2, 2, 2, 2, 2.5]), 1).faixa).toBe(1) // 14h30
    expect(M30.rotina300(cfg([3, 3, 3, 3, 3, 0, 0]), 1).faixa).toBe(2) // 15h
    expect(M30.rotina300(cfg([3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5]), 1).faixa).toBe(2) // 24h30
    expect(M30.rotina300(cfg([5, 5, 5, 5, 5, 0, 0]), 1).faixa).toBe(3) // 25h
    expect(M30.tetoPDF300(cfg([2, 2, 2, 2, 2, 2, 2.5]), 1)).toBe(3)
    expect(M30.tetoPDF300(cfg([3, 3, 3, 3, 3, 0, 0]), 1)).toBe(4)
    expect(M30.tetoPDF300(cfg([5, 5, 5, 5, 5, 0, 0]), 1)).toBe(5)
    expect(M30.tetoPDF300(cfg([6, 6, 6, 6, 6, 6, 0]), 1)).toBe(6)
    const R = normalizarRegras({ tetosPdf: [{ teto: 3 }, { teto: 2 }, {}, {}] })
    expect(M30.tetoPDF300(cfg([3, 3, 3, 3, 3, 0, 0]), 1, R)).toBe(2)
    expect(revisaoEmCiclo(1470)).toBe(true)
    expect(revisaoEmCiclo(1471)).toBe(false)
  })
})

describe('validarRegras (zod, pt-BR)', () => {
  it('aceita vazio/parcial e devolve normalizado', () => {
    const v = validarRegras({})
    expect(v.ok).toBe(true)
    expect(v.regras).toEqual(REGRAS_PADRAO)
    const p = validarRegras({ limitesDia: { pdfDistintos: 1 } })
    expect(p.ok).toBe(true)
    expect(p.regras?.limitesDia.pdfDistintos).toBe(1)
  })
  it('rejeita valores absurdos com mensagem em pt-BR', () => {
    const casos: Array<[unknown, RegExp]> = [
      [{ horizonte: { maxSemanas: 100000 } }, /máximo 600/],
      [{ horizonte: { maxSemanas: 1 } }, /mínimo 20/],
      [{ limitesDia: { pdfDistintos: 0 } }, /mínimo 1/],
      [{ limitesDia: { pdfDistintos: 99 } }, /máximo 6/],
      [{ divisao: { maxDatas: 2.5 } }, /inteiro/],
      [{ desempenho: { especialFlashAte: 150 } }, /máximo 100/],
      [{ desempenho: { acertoFracoPct: -5 } }, /mínimo 0/],
      [{ rodizio: { atrasoLimiar: 3 } }, /máximo 1/],
      [{ faixas: [{ id: 'a', nome: 'A', minMin: 0, maxMin: null, tetoPdf: 99, soRegra23: false, equilibra: false, revisaoModo: 'ciclo', modoQuestoes: 'livre' }] }, /máximo 12/],
      [{ faixas: [] }, /ao menos uma/],
      [{ juris: { diasPreferidos: [] } }, /ao menos um/],
      [{ juris: { diasPreferidos: [9] } }, /máximo 6/],
      [{ limitesDia: { pdfDistintos: 'abc' } }, /número/],
    ]
    for (const [entrada, re] of casos) {
      const v = validarRegras(entrada)
      expect(v.ok, JSON.stringify(entrada)).toBe(false)
      expect(v.erros.join(' | '), JSON.stringify(entrada)).toMatch(re)
    }
    expect(validarRegras(null).ok).toBe(false)
    expect(validarRegras([]).ok).toBe(false)
  })
  it('rejeita incoerências entre campos', () => {
    expect(validarRegras({ desempenho: { historicoOkMin: 40, historicoFlashMin: 60 } }).erros.join(' ')).toMatch(/PDFlash/)
    expect(validarRegras({ desempenho: { especialPdfAbaixo: 80, especialFlashAte: 70 } }).erros.join(' ')).toMatch(/PDFull/)
    expect(validarRegras({ revisao: { padrao: 5 } }).erros.join(' ')).toMatch(/padrão/)
    const F = (id: string, min: number, max: number | null) => ({ id, nome: id, minMin: min, maxMin: max, tetoPdf: 3, soRegra23: false, equilibra: false, revisaoModo: 'ciclo', modoQuestoes: 'livre' })
    expect(validarRegras({ faixas: [F('a', 0, 600), F('b', 700, null)] }).erros.join(' ')).toMatch(/lacuna/)
    expect(validarRegras({ faixas: [F('a', 0, 600), F('b', 500, null)] }).erros.join(' ')).toMatch(/sobreposição/)
    expect(validarRegras({ legproc: { metasDiaBase: 6, metasDiaMax: 3 } }).erros.join(' ')).toMatch(/LegProc/)
  })
  it('normalizarRegras faz clamp (nunca quebra o motor)', () => {
    const n = normalizarRegras({ horizonte: { maxSemanas: 99999 }, limitesDia: { pdfDistintos: -3 }, desempenho: { especialFlashAte: 500 } })
    expect(n.horizonte.maxSemanas).toBe(600)
    expect(n.limitesDia.pdfDistintos).toBe(1)
    expect(n.desempenho.especialFlashAte).toBe(100)
  })
})

describe('SENSIBILIDADE: as regras realmente mudam o plano', () => {
  it('teto de PDFulls novos da faixa 2 (4 → 2) reduz PDFulls novos por semana', () => {
    const cfg = base({ horas: [4, 4, 4, 4, 4, 0, 0] }) // 20h = faixa 2
    const a = gerar(cfg), b = gerar(cfg, { tetosPdf: [{}, { teto: 2 }, {}, {}] })
    const ia = iniciosPorSemana(a.plano, cfg.start), ib = iniciosPorSemana(b.plano, cfg.start)
    // as 4 primeiras semanas (antes da reta final / encaixes extras) obedecem ao teto
    const max = (m: Record<number, number>) => Math.max(...[1, 2, 3, 4].map((s) => m[s] || 0))
    expect(max(ia)).toBeGreaterThan(2)
    expect(max(ib)).toBeLessThanOrEqual(2)
    expect(b.fim).toBeGreaterThanOrEqual(a.fim)
    expect(JSON.stringify(a.plano)).not.toBe(JSON.stringify(b.plano))
  })
  it('regras padrão explícitas = sem regras (mesmo plano)', () => {
    const cfg = base({ horas: [4, 4, 4, 4, 4, 0, 0] })
    expect(JSON.stringify(gerar(cfg, REGRAS_PADRAO).plano)).toBe(JSON.stringify(gerar(cfg).plano))
    expect(JSON.stringify(gerar(cfg, {}).plano)).toBe(JSON.stringify(gerar(cfg).plano))
  })
  it('limiar 70 → 60 muda a semana especial (resultado do tema e plano)', () => {
    // 36h/semana (rotina acima de 24h30 = semana especial por desempenho). Progresso: metas até a semana 7 concluídas; questões com 65%.
    const cfg = base({ horas: [6, 6, 6, 6, 6, 6, 0], revisao: { ativa: true, cada: 4 } })
    const p0 = gerar(cfg)
    const hoje = '2026-02-16'
    const fixos: Plano = {}, prog: Record<string, { s: string; em: string }> = {}
    for (const [id, [d, h]] of Object.entries(p0.plano)) if (d < hoje && !/^jp:/.test(id)) { fixos[id] = [d, h]; prog[id] = { s: 'done', em: d } }
    const qus = Object.keys(fixos).filter((id) => /^qu:\d+$/.test(id)).sort()
    expect(qus.length).toBeGreaterThanOrEqual(3)
    const notas: Record<string, { res: number; cert: number; err: number; resultadoAtualizadoEm: number }> = {}
    qus.slice(0, 4).forEach((id, k) => { notas[id] = { res: 100, cert: 65, err: 35, resultadoAtualizadoEm: 1000 + k } })
    const ctx = { ordem: CAT.ordem, hoje, prog, notas, planoAtual: p0.plano, detalhes: p0.detalhes, feitas: Object.keys(prog) }
    const rodar = (regras?: unknown) => M30.gerarPlano(JSON.parse(JSON.stringify(cfg)), AS, LP, JSON.parse(JSON.stringify(fixos)), hoje, { ...ctx, ...(regras ? { regras: regras as never } : {}) })
    const padrao = rodar(), baixo = rodar({ desempenho: { especialFlashAte: 60 } })
    // resultado do tema: 65% fica em PDFlash (≤70) no padrão e vira "ok" com o limiar em 60
    const E1 = M30._interno.criarEnv(AS, LP, ctx as never, M30.resolverParams({}))
    const E2 = M30._interno.criarEnv(AS, LP, { ...ctx, regras: { desempenho: { especialFlashAte: 60 } } } as never, M30.resolverParams({}))
    const i = +qus[0].split(':')[1], ate = '2026-04-20'
    expect(M30.resultadoTema217(E1, i, ate)?.tipo).toBe('fl')
    expect(M30.resultadoTema217(E2, i, ate)?.tipo).toBe('ok')
    // e o plano da semana especial muda
    const especiais = (p: Plano) => Object.keys(p).filter((id) => /^(rq:|(pf|fl):\d+:revisao:|rf:)/.test(id)).sort()
    expect(especiais(padrao.plano)).not.toEqual(especiais(baixo.plano))
  })
  it('retornos por dia / limites diários mudam o plano (questões por dia 2 → 1 na faixa equilibrada)', () => {
    const cfg = base({ horas: [5, 5, 5, 5, 5, 0, 0] }) // 25h = faixa equilibrada
    const a = gerar(cfg), b = gerar(cfg, { equilibrio: { questoesDia: 1 }, limitesDia: { questoes: 1 } })
    expect(JSON.stringify(a.plano)).not.toBe(JSON.stringify(b.plano))
  })
})

describe('tiposGx (fase 3a)', () => {
  it('padrão vazio, normalização com clamp/slug e limite de chaves', () => {
    expect(REGRAS_PADRAO.tiposGx).toEqual({})
    expect(normalizarRegras({}).tiposGx).toEqual({})
    const n = normalizarRegras({ tiposGx: { Ruim: {}, 'a': {}, resumo: { maxPorDia: 99, maxPorSemana: 0, dias: [9, 2, 2], faixas: [], aPartirDaSemana: -4, ativo: false } } }).tiposGx
    expect(Object.keys(n)).toEqual(['resumo'])
    expect(n.resumo).toEqual({ ativo: false, maxPorDia: 20, maxPorSemana: null, dias: [2], faixas: [], aPartirDaSemana: 0 })
    const muitos = Object.fromEntries(Array.from({ length: 80 }, (_, k) => ['tipo-' + String(k).padStart(2, '0'), {}]))
    expect(Object.keys(normalizarRegras({ tiposGx: muitos }).tiposGx).length).toBe(50)
  })
  it('hash estável: vazio não entra; com regra muda', () => {
    expect(hashRegras({ tiposGx: {} })).toBe(HASH_REGRAS_PADRAO)
    expect(hashRegras({ tiposGx: { resumo: { maxPorDia: 1 } } })).not.toBe(HASH_REGRAS_PADRAO)
    expect(hashRegras({ tiposGx: { resumo: { maxPorDia: 1 } } })).toBe(hashRegras({ tiposGx: { resumo: { maxPorDia: 1 } } }))
  })
  it('delta contra o padrão e validação com mensagem citando o slug', () => {
    expect(deltaDoPadrao({ tiposGx: {} })).toEqual({})
    const d = deltaDoPadrao({ tiposGx: { resumo: { maxPorDia: 2 } } })
    expect(Object.keys(d)).toEqual(['tiposGx'])
    expect(normalizarRegras(d).tiposGx.resumo.maxPorDia).toBe(2)
    const v = validarRegras({ tiposGx: { resumo: { maxPorDia: 0, dias: [9] } } })
    expect(v.ok).toBe(false)
    expect(v.erros.join(' ')).toContain('"resumo"')
    expect(validarRegras({ tiposGx: { resumo: { maxPorDia: 2 } } }).ok).toBe(true)
  })
})
