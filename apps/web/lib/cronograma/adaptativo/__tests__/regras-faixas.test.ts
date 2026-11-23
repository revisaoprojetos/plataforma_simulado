import { describe, it, expect } from 'vitest'
import { REGRAS_PADRAO, HASH_REGRAS_PADRAO, normalizarRegras, resolverFaixa, resolverTetoPdf, hashRegras, deltaDoPadrao, revisaoEmCiclo, resolverFaixaCarga } from '../regras'
import { FAIXAS_PADRAO, validarFaixas, indiceDaFaixa, regrasDaFaixa, temOverrides, criarRegrasVivas, baseDeRegras, textoHoras, type FaixaCarga } from '../faixas-carga'
import { validarRegras } from '../regras-validacao'
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

const F = (id: string, min: number, max: number | null, o: Partial<FaixaCarga> = {}): FaixaCarga => ({
  id, nome: id, minMin: min, maxMin: max, tetoPdf: 3, soRegra23: false, equilibra: false, revisaoModo: 'ciclo', cicloSemanas: null, opcoesNovas: null, padrao: null, modoQuestoes: 'livre', overrides: {}, ...o,
})
/** Fórmulas ANTIGAS (hard-coded até a 3.2.0) para comparar com as faixas dinâmicas padrão. */
const antigo = {
  classe: (m: number) => (m < 900 ? 1 : m <= 1470 ? 2 : 3),
  teto: (m: number, r23: boolean) => (r23 && m <= 870 ? 3 : m <= 1470 ? 4 : m <= 2100 ? 5 : 6),
  equilibra: (m: number) => m > 1470 && m <= 2100,
  ciclo: (m: number) => m <= 1470,
}

describe('G1 · faixas dinâmicas: padrão = comportamento antigo', () => {
  it('classe/teto/equilibra/ciclo idênticos às fórmulas antigas em todas as cargas (blocos de 30 min)', () => {
    for (let m = 0; m <= 7200; m += 30) {
      expect(resolverFaixa(m), `classe ${m}`).toBe(antigo.classe(m))
      for (const r23 of [true, false]) {
        const t = resolverTetoPdf(m, r23)
        expect(t.teto, `teto ${m}/${r23}`).toBe(antigo.teto(m, r23))
        expect(t.equilibra, `equilibra ${m}/${r23}`).toBe(antigo.equilibra(m))
      }
      expect(revisaoEmCiclo(m), `ciclo ${m}`).toBe(antigo.ciclo(m))
    }
  })
  it('hash do padrão = hash do formato antigo (calculado de forma independente)', () => {
    const estavel = (v: unknown): string => Array.isArray(v) ? '[' + v.map(estavel).join(',') + ']' : v && typeof v === 'object'
      ? '{' + Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => JSON.stringify(k) + ':' + estavel((v as Record<string, unknown>)[k])).join(',') + '}' : (JSON.stringify(v) ?? 'null')
    const { faixas: _f, constantes: _c, restricoes: _r, adaptacao: _a, ...resto } = JSON.parse(JSON.stringify(REGRAS_PADRAO))
    const velho = {
      ...resto,
      faixas: { faixa1AteMinExclusivo: 900, faixa2AteMinInclusivo: 1470 },
      tetosPdf: [{ ateMin: 870, teto: 3, soRegra23: true, equilibra: false }, { ateMin: 1470, teto: 4, soRegra23: false, equilibra: false }, { ateMin: 2100, teto: 5, soRegra23: false, equilibra: true }, { ateMin: null, teto: 6, soRegra23: false, equilibra: false }],
      revisao: { ...resto.revisao, cicloAteMin: 1470 },
    }
    const s = estavel(velho)
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677) }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    const esperado = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
    expect(HASH_REGRAS_PADRAO).toBe(esperado)
    // regras customizadas mudam o hash; faixas ou constantes no padrão não
    expect(hashRegras({ constantes: { blocoMin: 30 } })).toBe(HASH_REGRAS_PADRAO)
    expect(hashRegras({ constantes: { blocoMin: 60 } })).not.toBe(HASH_REGRAS_PADRAO)
    expect(hashRegras({ faixas: FAIXAS_PADRAO.map((f, k) => (k === 1 ? { ...f, tetoPdf: 2 } : f)) })).not.toBe(HASH_REGRAS_PADRAO)
  })
  it('faixas padrão são válidas e o delta do padrão é vazio', () => {
    expect(validarFaixas(FAIXAS_PADRAO)).toEqual([])
    expect(deltaDoPadrao({})).toEqual({})
    expect(normalizarRegras(JSON.parse(JSON.stringify(REGRAS_PADRAO)))).toEqual(REGRAS_PADRAO)
  })
  it('formato legado (faixas{} + tetosPdf[] + cicloAteMin) é convertido', () => {
    const R = normalizarRegras({ faixas: { faixa1AteMinExclusivo: 1200, faixa2AteMinInclusivo: 1800 }, tetosPdf: [{ ateMin: 1199, teto: 2 }, { ateMin: 1800, teto: 4 }, { ateMin: 2400, teto: 5 }, { teto: 7 }], revisao: { cicloAteMin: 600 } })
    expect(R.faixas.map((f) => f.tetoPdf)).toEqual([2, 4, 5, 7])
    expect(R.faixas.map((f) => f.modoQuestoes)).toEqual(['revisao', 'revisao_pdf', 'livre', 'livre'])
    expect(R.faixas.map((f) => f.revisaoModo)).toEqual(['desempenho', 'desempenho', 'desempenho', 'desempenho'])
  })
})

describe('G1 · faixas customizadas (3 e 5 faixas)', () => {
  const tres = [F('a', 0, 1200, { tetoPdf: 2, modoQuestoes: 'revisao_pdf' }), F('b', 1201, 2400, { tetoPdf: 4, revisaoModo: 'desempenho', equilibra: true }), F('c', 2401, null, { tetoPdf: 7, revisaoModo: 'desempenho' })]
  const cinco = [F('a', 0, 600, { tetoPdf: 1 }), F('b', 601, 1200, { tetoPdf: 2 }), F('c', 1201, 1800, { tetoPdf: 3, revisaoModo: 'desempenho' }), F('d', 1801, 2400, { tetoPdf: 5, revisaoModo: 'desempenho', equilibra: true }), F('e', 2401, null, { tetoPdf: 8, revisaoModo: 'desempenho' })]
  it('validação: lacuna, sobreposição, ordem, mínimo 1, última sem limite', () => {
    expect(validarFaixas(tres)).toEqual([])
    expect(validarFaixas(cinco)).toEqual([])
    expect(validarFaixas([]).join()).toMatch(/ao menos uma/)
    expect(validarFaixas([F('a', 0, 600), F('b', 700, null)]).join()).toMatch(/lacuna/)
    expect(validarFaixas([F('a', 0, 600), F('b', 500, null)]).join()).toMatch(/sobreposição/)
    expect(validarFaixas([F('a', 10, null)]).join()).toMatch(/começar em 0/)
    expect(validarFaixas([F('a', 0, 600)]).join()).toMatch(/sem limite superior/)
    expect(validarFaixas([F('a', 0, 500), F('a', 501, null)]).join()).toMatch(/repetido/)
    expect(validarRegras({ faixas: tres }).ok).toBe(true)
    expect(validarRegras({ faixas: cinco }).ok).toBe(true)
  })
  it('normalizar: ordena, fecha lacunas e a última fica sem limite', () => {
    const R = normalizarRegras({ faixas: [F('c', 0, null, { tetoPdf: 9 }), F('a', 0, 500, { tetoPdf: 1 }), F('b', 0, 900, { tetoPdf: 2 })] })
    expect(R.faixas.map((f) => [f.id, f.minMin, f.maxMin, f.tetoPdf])).toEqual([['a', 0, 500, 1], ['b', 501, 900, 2], ['c', 901, null, 9]])
    expect(normalizarRegras({ faixas: [] }).faixas.length).toBe(4)
  })
  it('resolvedores usam as faixas customizadas', () => {
    const R3 = normalizarRegras({ faixas: tres }), R5 = normalizarRegras({ faixas: cinco })
    expect(R3.faixas.length).toBe(3); expect(R5.faixas.length).toBe(5)
    expect([resolverTetoPdf(600, true, R3).teto, resolverTetoPdf(1500, true, R3).teto, resolverTetoPdf(3000, true, R3).teto]).toEqual([2, 4, 7])
    expect([0, 700, 1500, 2000, 3000].map((m) => resolverTetoPdf(m, true, R5).teto)).toEqual([1, 2, 3, 5, 8])
    expect(revisaoEmCiclo(1200, R3)).toBe(true); expect(revisaoEmCiclo(1201, R3)).toBe(false)
    expect(resolverFaixaCarga(1500, R5).id).toBe('c')
    expect(indiceDaFaixa(R5.faixas, 2400)).toBe(3)
  })
  it('motor: o teto semanal de PDFull novo segue as faixas (3 e 5 faixas, rotina de 20h)', () => {
    const cfg20 = base({ horas: [4, 4, 4, 4, 4, 0, 0] }) // 20h = 1200 min
    const max4 = (m: Record<number, number>) => Math.max(...[1, 2, 3, 4].map((s) => m[s] || 0))
    const p3 = gerar(cfg20, { faixas: tres }) // 1200 → faixa a (teto 2)
    expect(max4(iniciosPorSemana(p3.plano, cfg20.start))).toBeLessThanOrEqual(2)
    const p5 = gerar(cfg20, { faixas: cinco }) // 1200 → faixa b (teto 2)
    expect(max4(iniciosPorSemana(p5.plano, cfg20.start))).toBeLessThanOrEqual(2)
    expect(JSON.stringify(p3.plano)).not.toBe(JSON.stringify(gerar(cfg20).plano))
  }, 120000)
  it('motor: modo de revisão por faixa (ehRev) e periodicidade do ciclo própria da faixa', () => {
    const cfg = base({ horas: [4, 4, 4, 4, 4, 0, 0], revisao: { ativa: true, cada: 8 } }) as Cfg28 & { motor?: string }
    cfg.motor = '3.2.0'
    const R = normalizarRegras({ faixas: [F('a', 0, 1500, { cicloSemanas: 3 }), F('b', 1501, null, { revisaoModo: 'desempenho' })] })
    expect([3, 6, 9].every((s) => M30.ehRev(cfg, s, R))).toBe(true)
    expect([4, 5, 7].some((s) => M30.ehRev(cfg, s, R))).toBe(false)
    const cfgAlta = { ...cfg, horas: [6, 6, 6, 6, 6, 0, 0] } as Cfg28
    expect(M30.ehRev(cfgAlta, 8, R)).toBe(true); expect(M30.ehRev(cfgAlta, 4, R)).toBe(false) // desempenho: a cada `cada` = 8
  })
})

describe('G2 · overrides por faixa', () => {
  const ov = (idx: number, overrides: FaixaCarga['overrides']) => ({ faixas: FAIXAS_PADRAO.map((f, k) => (k === idx ? { ...f, overrides } : f)) })
  it('normalização: mantém só as chaves informadas, com clamp; resolução = global → override', () => {
    const R = normalizarRegras(ov(1, { limitesDia: { questoes: 1, pdfDistintos: 99 }, juris: { exigeOptIn: false } }))
    expect(R.faixas[1].overrides.limitesDia).toEqual({ questoes: 1, pdfDistintos: 6 })
    expect(R.faixas[1].overrides.juris).toEqual({ exigeOptIn: false })
    expect(temOverrides(R.faixas)).toBe(true); expect(temOverrides(REGRAS_PADRAO.faixas)).toBe(false)
    const ef = regrasDaFaixa(R, R.faixas[1])
    expect(ef.limitesDia.questoes).toBe(1); expect(ef.limitesDia.revisoes).toBe(REGRAS_PADRAO.limitesDia.revisoes); expect(ef.juris.minSemanalMin).toBe(870)
    const vivo = criarRegrasVivas(R); expect(baseDeRegras(vivo)).toBe(R)
    expect(validarRegras(ov(1, { limitesDia: { questoes: 99 } })).ok).toBe(false)
    expect(validarRegras(ov(1, { limitesDia: { questoes: 1 } })).ok).toBe(true)
  })
  it('motor: override na faixa 2 muda o plano de 20h e NÃO vaza para outras cargas', () => {
    const regras = ov(1, { limitesDia: { pdfDistintos: 1, questoes: 1 } })
    const c20 = base({ horas: [4, 4, 4, 4, 4, 0, 0] }), c36 = base({ horas: [6, 6, 6, 6, 6, 6, 0] })
    expect(JSON.stringify(gerar(c20, regras).plano)).not.toBe(JSON.stringify(gerar(c20).plano))
    expect(JSON.stringify(gerar(c36, regras).plano)).toBe(JSON.stringify(gerar(c36).plano))
  }, 120000)
  it('motor: override com o MESMO valor do global gera o mesmo plano', () => {
    const regras = ov(1, { limitesDia: { pdfDistintos: 2, questoes: 2 } })
    const c20 = base({ horas: [4, 4, 4, 4, 4, 0, 0] })
    expect(JSON.stringify(gerar(c20, regras).plano)).toBe(JSON.stringify(gerar(c20).plano))
  }, 120000)
})

describe('G3 · constantes expostas (padrão idêntico)', () => {
  it('padrões e clamp', () => {
    expect(REGRAS_PADRAO.constantes).toEqual({ blocoMin: 30, questoesBaseDia: 1, reservaCicloDivisor: 3, prioridadesDomino: { revisaoDia: 1, revisaoRepetida: 2, rebaixada: 4 }, cotaPdflashDuracaoMin: 60, cargaMinimaMin: 0 })
    expect(normalizarRegras({ constantes: { blocoMin: 5, questoesBaseDia: 99 } }).constantes).toMatchObject({ blocoMin: 10, questoesBaseDia: 6 })
    expect(validarRegras({ constantes: { blocoMin: 5 } }).erros.join()).toMatch(/mínimo 10/)
    expect(validarRegras({ constantes: { cargaMinimaMin: 100 } }).erros.join()).toMatch(/5h/)
  })
  it('motor: carga mínima rejeita rotinas curtas; padrão não rejeita', () => {
    const c9 = base({ horas: [3, 3, 3, 0, 0, 0, 0] })
    expect(() => gerar(c9, { constantes: { cargaMinimaMin: 600 } })).toThrow(/pelo menos 10h/)
    expect(() => gerar(c9)).not.toThrow()
  }, 120000)
  it('motor: bloco mínimo e questões base/dia mudam o plano', () => {
    const c = base({ horas: [4, 4, 4, 4, 4, 0, 0] })
    const a = JSON.stringify(gerar(c).plano)
    const b60 = (() => { try { return JSON.stringify(gerar(c, { constantes: { blocoMin: 60 } }).plano) } catch { return 'ERRO' } })()
    expect(b60).not.toBe(a) // bloco de 60 min muda o plano (ou o torna inviável)
    const c36 = base({ horas: [6, 6, 6, 6, 6, 6, 0] }) // >35h: fora da faixa equilibrada, onde vale "base + heranças"
    expect(JSON.stringify(gerar(c36, { constantes: { questoesBaseDia: 3 } }).plano)).not.toBe(JSON.stringify(gerar(c36).plano))
  }, 180000)
  it('mensagem da Jurisprudência é gerada da regra', () => {
    expect(textoHoras(870)).toBe('14h30'); expect(textoHoras(780)).toBe('13h')
  })
})
