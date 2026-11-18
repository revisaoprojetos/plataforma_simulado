import { describe, it, expect } from 'vitest'
import { localizarNoTrecho, localizarEntreTrechos, contextoDe } from './anotacao-ancora'

const an = (t: string, i: number, extra: object = {}) => ({ texto_ancora: t, inicio_offset: i, fim_offset: i + t.length, ...extra })

describe('localizarNoTrecho', () => {
  it('trecho editado em OUTRA parte, grifo intacto no mesmo offset → offset (não é "alterada")', () => {
    const velho = 'O prazo para contestar é de quinze dias. Nada mais.'
    const novo = 'O prazo para contestar é de quinze dias. Nada além disso.'
    const r = localizarNoTrecho(an('prazo para contestar', 2), novo, velho)!
    expect(r.metodo).toBe('offset')
  })
  it('texto antes do grifo mudou de tamanho → desloca os offsets (único)', () => {
    const velho = 'O prazo para contestar é de quinze dias.'
    const novo = 'Importante: o prazo para contestar é de quinze dias.'
    const r = localizarNoTrecho(an('prazo para contestar', 2), novo, velho)!
    expect(novo.slice(r.inicio, r.fim)).toBe('prazo para contestar')
    expect(r.metodo).toBe('unico')
  })
  it('texto repetido: desempata pelo contexto derivado do texto antigo', () => {
    const velho = 'Alfa: em cinco dias. Beta: em cinco dias.'
    const i = velho.lastIndexOf('em cinco dias')
    const novo = 'Prefixo novo. Alfa: em cinco dias. Beta: em cinco dias.'
    const r = localizarNoTrecho(an('em cinco dias', i), novo, velho)!
    expect(novo.slice(r.inicio - 6, r.inicio)).toBe('Beta: ')
    expect(r.metodo).toBe('contexto')
  })
  it('repetido sem contexto → null (ambíguo; mantém alterada)', () => {
    expect(localizarNoTrecho(an('em cinco dias', 0), 'x em cinco dias y em cinco dias', 'outro texto')).toBeNull()
  })
  it('texto removido → null', () => {
    expect(localizarNoTrecho(an('prazo para contestar', 2), 'O prazo foi extinto.', 'O prazo para contestar')).toBeNull()
  })
  it('usa contexto gravado quando existe', () => {
    expect(contextoDe(an('x', 0, { contexto_antes: 'a', contexto_depois: 'b' }))).toEqual({ antes: 'a', depois: 'b' })
  })
})

describe('localizarEntreTrechos (órfã)', () => {
  const trechos = [{ uid: 'u1', texto: 'Primeiro parágrafo sem relação.' }, { uid: 'u2', texto: 'A decisão será publicada no diário oficial eletrônico.' }]
  it('texto único em outro trecho → relocaliza', () => {
    const r = localizarEntreTrechos(an('decisão será publicada no diário oficial', 0), trechos)!
    expect(r.uid).toBe('u2')
    expect(trechos[1].texto.slice(r.inicio, r.fim)).toBe('decisão será publicada no diário oficial')
  })
  it('curto ou repetido → null', () => {
    expect(localizarEntreTrechos(an('decisão', 0), trechos)).toBeNull()
    expect(localizarEntreTrechos(an('decisão será publicada no diário oficial', 0), [...trechos, ...trechos.map((t) => ({ ...t, uid: t.uid + 'b' }))])).toBeNull()
  })
})
