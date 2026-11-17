import { describe, it, expect } from 'vitest'
import { reancorarParcial } from '../reanchor-parcial'

const ORIG = 'Art. 5º Todos são iguais perante a lei, sem distinção de qualquer natureza, garantindo-se aos brasileiros a inviolabilidade do direito à vida.'
const exact = 'Todos são iguais perante a lei, sem distinção de qualquer natureza, garantindo-se aos brasileiros'
const ini = ORIG.indexOf(exact)
const a = { inicio: ini, fim: ini + exact.length, exact, prefix: ORIG.slice(ini - 8, ini), suffix: ORIG.slice(ini + exact.length, ini + exact.length + 8) }
const txt = (r: ReturnType<typeof reancorarParcial>) => r.map((x) => x.exact)

describe('reancorarParcial', () => {
  it('sem mudança: mesmo trecho', () => {
    expect(txt(reancorarParcial(ORIG, a))).toEqual([exact])
  })
  it('texto antes foi apagado: só desloca', () => {
    const S = ORIG.replace('Art. 5º ', '')
    const r = reancorarParcial(S, a)
    expect(txt(r)).toEqual([exact])
    expect(S.slice(r[0].inicio, r[0].fim)).toBe(exact)
  })
  it('apagou o início do grifo: encurta', () => {
    const S = ORIG.replace('Todos são iguais perante a lei, ', '')
    expect(txt(reancorarParcial(S, a))).toEqual(['sem distinção de qualquer natureza, garantindo-se aos brasileiros'])
  })
  it('apagou o fim do grifo: encurta', () => {
    const S = ORIG.replace(' garantindo-se aos brasileiros', '')
    expect(txt(reancorarParcial(S, a))).toEqual(['Todos são iguais perante a lei, sem distinção de qualquer natureza,'])
  })
  it('apagou o miolo: o que sobrou fica contíguo, sem o trecho apagado', () => {
    const S = ORIG.replace(' sem distinção de qualquer natureza,', '')
    const r = reancorarParcial(S, a)
    expect(txt(r)).toEqual(['Todos são iguais perante a lei, garantindo-se aos brasileiros'])
  })
  it('texto novo no meio: divide em dois e o inserido não fica grifado', () => {
    const S = ORIG.replace('sem distinção', 'sem NOVO TRECHO INSERIDO PELO ADMIN AQUI distinção')
    const r = reancorarParcial(S, a)
    expect(r.length).toBe(2)
    expect(r.map((x) => x.exact).join('|')).not.toContain('NOVO')
  })
  it('tudo apagado: nada sobra', () => {
    const S = ORIG.replace(exact, '')
    expect(reancorarParcial(S, a)).toEqual([])
  })
})
