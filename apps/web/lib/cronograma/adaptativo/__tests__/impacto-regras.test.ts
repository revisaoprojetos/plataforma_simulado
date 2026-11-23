import { describe, it, expect } from 'vitest'
import { compararResultados, concluidasDivergentes, diffEventos, exigeConfirmacao, listarMudancas, resumirTrava, type PlanoMini, type ResultadoGeracao } from '../impacto-regras'

const gravado: PlanoMini = { 'pf:1': ['2026-01-05', 1], 'pf:2': ['2026-01-06', 1], 'fl:3': ['2026-01-20', 1], 'qu:4': ['2026-02-02', 1] }
const res = (plano: PlanoMini | null, fim = 5, violacoes = 0, erro?: string): ResultadoGeracao => ({ plano, fim, violacoes, ...(erro ? { erro } : {}) })
const conc = new Set(['pf:1', 'pf:2'])

describe('impacto-regras', () => {
  it('só pendentes mudam: concluídas divergentes = 0, Δ fim, movidas e removidas', () => {
    const base = res(gravado, 5)
    const alt = res({ 'pf:1': ['2026-01-05', 1], 'pf:2': ['2026-01-06', 1], 'fl:3': ['2026-01-22', 1], 'xx:9': ['2026-03-09', 1] }, 8)
    const i = compararResultados(base, alt, gravado, conc)
    expect(i.concluidasDivergentes).toBe(0)
    expect(i.movidas).toBe(1); expect(i.removidas).toBe(1); expect(i.adicionadas).toBe(1)
    expect(i.deltaFimSemanas).toBe(3)
    expect(i.deltaFimDias).toBe(35) // 02-02 -> 03-09
  })
  it('detecta concluída movida ou sumida', () => {
    expect(concluidasDivergentes(gravado, { 'pf:1': ['2026-01-07', 1] }, conc)).toEqual(['pf:1', 'pf:2'])
    const i = compararResultados(res(gravado), res({ ...gravado, 'pf:2': ['2026-01-09', 1] }), gravado, conc)
    expect(i.concluidasDivergentes).toBe(1); expect(i.exemplosDivergentes).toEqual(['pf:2'])
    expect(i.movidas).toBe(0) // concluída não conta como pendente movida
  })
  it('erro de geração vira erroAlt e não quebra', () => {
    const i = compararResultados(res(gravado), res(null, 0, 0, 'Horizonte insuficiente'), gravado, conc)
    expect(i.erroAlt).toBe('Horizonte insuficiente'); expect(i.erroBase).toBeUndefined(); expect(i.movidas).toBe(0)
  })
  it('listarMudancas', () => {
    const m = listarMudancas(gravado, { 'pf:1': ['2026-01-05', 1], 'fl:3': ['2026-01-21', 1] }, conc, 10)
    expect(m.total).toBe(2); expect(m.itens.find((x) => x.id === 'qu:4')?.para).toBeNull()
  })
  it('trava: exige confirmação por divergência ou erro NOVO; erro preexistente não', () => {
    const ok = compararResultados(res(gravado), res(gravado), gravado, conc)
    expect(exigeConfirmacao(resumirTrava([{ planoId: 'a', impacto: ok }]))).toBe(false)
    const div = compararResultados(res(gravado), res({ ...gravado, 'pf:1': ['2026-02-01', 1] }), gravado, conc)
    const r1 = resumirTrava([{ planoId: 'a', impacto: ok }, { planoId: 'b', impacto: div }])
    expect(r1).toMatchObject({ planos: 2, comDivergencia: 1, totalDivergentes: 1 }); expect(exigeConfirmacao(r1)).toBe(true)
    const novo = compararResultados(res(gravado), res(null, 0, 0, 'falhou'), gravado, conc)
    expect(exigeConfirmacao(resumirTrava([{ planoId: 'c', impacto: novo }]))).toBe(true)
    const antigo = compararResultados(res(null, 0, 0, 'ja falhava'), res(null, 0, 0, 'falhou'), gravado, conc)
    const r3 = resumirTrava([{ planoId: 'd', impacto: antigo }])
    expect(r3.errosPreexistentes).toBe(1); expect(exigeConfirmacao(r3)).toBe(false)
  })
  it('diffEventos', () => {
    const e = (id: string, texto = 't', de = '2026-01-01') => ({ id, cod: 'restricao', texto, de, ate: de, n: 1 })
    const d = diffEventos([e('a'), e('b'), e('c', 'x')], [e('b'), e('c', 'y'), e('d')])
    expect(d.soBase.map((x) => x.id)).toEqual(['a'])
    expect(d.soAlt.map((x) => x.id)).toEqual(['d'])
    expect(d.mudaram.map((x) => x.base.id)).toEqual(['c'])
  })
})
