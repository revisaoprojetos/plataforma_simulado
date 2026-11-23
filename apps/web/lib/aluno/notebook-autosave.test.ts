import { describe, it, expect } from 'vitest'
import { estadoInicial, reduzir, coalescer, backoffMs, proximoEnvio, classificarResposta, mesclarFila, removerDaFila, rotuloIndicador } from './notebook-autosave'

const d = (n: number) => ({ type: 'doc', n })

describe('coalescer', () => {
  it('última vence por campo', () => {
    expect(coalescer({ doc: d(1), titulo: 'a' }, { doc: d(2) })).toEqual({ doc: d(2), titulo: 'a' })
    expect(coalescer(null, { titulo: 'x' })).toEqual({ titulo: 'x' })
  })
})

describe('reducer', () => {
  it('fluxo normal', () => {
    let s = estadoInicial(3)
    s = reduzir(s, { t: 'editar', alt: { doc: d(1) } })
    expect(s.fase).toBe('sujo')
    s = reduzir(s, { t: 'iniciar', opId: 'op1' })
    expect(s.emVoo).toMatchObject({ opId: 'op1', versao: 3 })
    expect(s.pendente).toBeNull()
    s = reduzir(s, { t: 'ok', versao: 4 })
    expect(s).toMatchObject({ versao: 4, fase: 'ocioso', emVoo: null })
  })
  it('edição durante o voo coalesce e reenvia depois', () => {
    let s = reduzir(estadoInicial(1), { t: 'editar', alt: { doc: d(1) } })
    s = reduzir(s, { t: 'iniciar', opId: 'a' })
    s = reduzir(s, { t: 'editar', alt: { doc: d(2) } })
    s = reduzir(s, { t: 'editar', alt: { doc: d(3) } })
    expect(proximoEnvio(s)).toBeNull() // em voo
    s = reduzir(s, { t: 'ok', versao: 2 })
    expect(s.fase).toBe('sujo')
    expect(proximoEnvio(s)).toEqual({ doc: d(3) })
  })
  it('falha de rede mantém opId na retentativa', () => {
    let s = reduzir(estadoInicial(1), { t: 'editar', alt: { doc: d(1) } })
    s = reduzir(s, { t: 'iniciar', opId: 'a' })
    s = reduzir(s, { t: 'rede' })
    expect(s.fase).toBe('offline')
    s = reduzir(s, { t: 'iniciar', opId: 'b' })
    expect(s.emVoo?.opId).toBe('a')
    expect(s.tentativas).toBe(1)
  })
  it('conflito bloqueia envio; manter minha reenvia sobre a versão do servidor', () => {
    let s = reduzir(estadoInicial(1), { t: 'editar', alt: { doc: d(1) } })
    s = reduzir(s, { t: 'iniciar', opId: 'a' })
    s = reduzir(s, { t: 'editar', alt: { titulo: 'novo' } })
    s = reduzir(s, { t: 'conflito', versaoAtual: 7 })
    expect(proximoEnvio(s)).toBeNull()
    s = reduzir(s, { t: 'manter_minha', versaoAtual: 7 })
    expect(s).toMatchObject({ versao: 7, fase: 'sujo', emVoo: null, conflito: null })
    expect(s.pendente).toEqual({ doc: d(1), titulo: 'novo' })
  })
  it('usar do servidor descarta o local', () => {
    let s = reduzir(estadoInicial(1), { t: 'editar', alt: { doc: d(1) } })
    s = reduzir(s, { t: 'conflito', versaoAtual: 5 })
    s = reduzir(s, { t: 'usar_servidor', versao: 5 })
    expect(s).toMatchObject({ versao: 5, pendente: null, fase: 'ocioso' })
  })
})

describe('backoff', () => {
  it('cresce e respeita o teto', () => {
    expect(backoffMs(0, 0.5)).toBe(1000)
    expect(backoffMs(2, 0.5)).toBe(4000)
    expect(backoffMs(20, 0.5)).toBe(30000)
    expect(backoffMs(3, 0)).toBeLessThan(backoffMs(3, 1))
  })
})

describe('classificarResposta', () => {
  it('mapeia status', () => {
    expect(classificarResposta(200, { versao: 5 })).toEqual({ k: 'ok', versao: 5 })
    expect(classificarResposta(409, { code: 'conflito', versao_atual: 9 })).toEqual({ k: 'conflito', versaoAtual: 9 })
    expect(classificarResposta(null, null)).toEqual({ k: 'rede' })
    expect(classificarResposta(503, { code: 'migracao_pendente' })).toEqual({ k: 'erro', migracaoPendente: true })
    expect(classificarResposta(500, {})).toEqual({ k: 'rede' })
    expect(classificarResposta(422, {}).k).toBe('erro')
  })
})

describe('fila', () => {
  it('mescla por página mantendo versão base mais antiga', () => {
    let f = mesclarFila([], { paginaId: 'p', versao: 2, opId: 'a', alt: { doc: d(1) }, em: 1 })
    f = mesclarFila(f, { paginaId: 'p', versao: 3, opId: 'b', alt: { titulo: 't' }, em: 2 })
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ versao: 2, opId: 'b', alt: { doc: d(1), titulo: 't' } })
    expect(removerDaFila(f, 'p', 'x')).toHaveLength(1)
    expect(removerDaFila(f, 'p')).toHaveLength(0)
  })
})

describe('rótulo', () => {
  it('estados', () => {
    expect(rotuloIndicador('ocioso', true, false)).toBe('Salvo')
    expect(rotuloIndicador('sujo', true, false)).toBe('Salvando…')
    expect(rotuloIndicador('ocioso', false, false)).toMatch(/Offline/)
    expect(rotuloIndicador('erro', true, false)).toMatch(/tentar de novo/)
  })
})

describe('payload tinta (folha livre)', () => {
  it('coalesce tinta e titulo independentemente; tinta sozinha não é vazia', () => {
    const t = (n: number) => ({ versao: 1, n })
    expect(coalescer({ tinta: t(1), titulo: 'a' }, { tinta: t(2) })).toEqual({ tinta: t(2), titulo: 'a' })
    expect(coalescer({ tinta: t(1) }, { titulo: 'x' })).toEqual({ tinta: t(1), titulo: 'x' })
    let s = reduzir(estadoInicial(1), { t: 'editar', alt: { tinta: t(1) } })
    expect(proximoEnvio(s)).toEqual({ tinta: t(1) })
    s = reduzir(s, { t: 'iniciar', opId: 'a' })
    expect(s.emVoo?.alt).toEqual({ tinta: t(1) })
  })
})

describe('versao_base (PATCH de aparência/nível sem remontar o editor)', () => {
  it('avança a base; nunca recua; preserva pendente', () => {
    let s = estadoInicial(3)
    s = reduzir(s, { t: 'editar', alt: { titulo: 'x' } })
    s = reduzir(s, { t: 'versao_base', versao: 5 })
    expect(s.versao).toBe(5)
    expect(s.pendente).toEqual({ titulo: 'x' })
    expect(reduzir(s, { t: 'versao_base', versao: 4 }).versao).toBe(5)
  })
  it('o próximo envio usa a nova base', () => {
    let s = reduzir(estadoInicial(1), { t: 'versao_base', versao: 7 })
    s = reduzir(s, { t: 'editar', alt: { doc: { type: 'doc' } } })
    s = reduzir(s, { t: 'iniciar', opId: 'a' })
    expect(s.emVoo?.versao).toBe(7)
  })
  it('campos independentes coalescem sem misturar (só título / só corpo)', () => {
    expect(coalescer({ titulo: 'a' }, { doc: { type: 'doc' } })).toEqual({ titulo: 'a', doc: { type: 'doc' } })
    expect(coalescer({ titulo: 'a' }, { titulo: 'b' })).toEqual({ titulo: 'b' })
  })
})
