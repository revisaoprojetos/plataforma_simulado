import { describe, it, expect } from 'vitest'
import { diagnosticarIndice, numeroDoArtigo, type TrechoDiag } from './diagnostico-indice'

const art = (n: string, uid = `u${n}`): TrechoDiag => ({ uid, tipo: 'artigo', rotulo: `Art. ${n}`, texto: null })
const est = (tipo: string, rotulo: string | null, uid = `e-${rotulo}`): TrechoDiag => ({ uid, tipo, rotulo })
const par = (): TrechoDiag => ({ uid: 'p', tipo: 'paragrafo', rotulo: null, texto: 'Conforme o Art. 99 da CF…' })

describe('numeroDoArtigo', () => {
  it('lê base e sufixo', () => {
    expect(numeroDoArtigo(art('5º-A'))).toMatchObject({ base: 5, sufixo: 'A', chave: '5-A' })
    expect(numeroDoArtigo(art('1.234'))?.base).toBe(1234)
    expect(numeroDoArtigo({ tipo: 'artigo', rotulo: null, texto: 'Art. 1º - A lei dispõe' })).toMatchObject({ base: 1, sufixo: null })
    expect(numeroDoArtigo(art('único'))).toBeNull()
  })
})

describe('diagnosticarIndice', () => {
  it('lei limpa = ok (com -A tolerado)', () => {
    const d = diagnosticarIndice([est('capitulo', 'Capítulo I'), art('1º'), art('2º'), art('2º-A'), art('3º'), est('capitulo', 'Capítulo II'), art('4º'), par()])
    expect(d.severidade).toBe('ok')
    expect(d.totalArtigos).toBe(5)
    expect(d.saltos).toEqual([])
    expect(d.foraDeOrdem).toEqual([])
    expect(d.numeracaoComecaEm).toBe(1)
    expect(d.contagemPorTipo.capitulo).toBe(2)
  })

  it('salto 5→7 = revisar', () => {
    const d = diagnosticarIndice([est('capitulo', 'Capítulo I'), art('4º'), art('5º'), art('7º'), art('8º')])
    expect(d.saltos).toEqual([{ de: 5, para: 7, faltantes: 1, trechoUid: 'u7º' }])
    expect(d.severidade).toBe('revisar')
    expect(d.pendencias.some((p) => p.codigo === 'salto_numeracao' && p.trechoUid === 'u7º')).toBe(true)
    expect(d.numeracaoComecaEm).toBe(4)
  })

  it('salto enorme = crítico', () => {
    const d = diagnosticarIndice([est('titulo', 'Título I'), art('1º'), art('2º'), art('200º')])
    expect(d.severidade).toBe('critico')
  })

  it('duplicado e fora de ordem', () => {
    const d = diagnosticarIndice([est('titulo', 'Título I'), art('1º'), art('2º', 'a'), art('3º'), art('2º', 'b'), art('4º'), art('5º'), art('3º-A'), art('3º')])
    expect(d.duplicados.map((x) => x.rotulo)).toEqual(['Art. 2º', 'Art. 3º'])
    expect(d.foraDeOrdem).toEqual([])
    const f = diagnosticarIndice([est('titulo', 'Título I'), art('1º'), art('2º'), art('5º'), art('3º'), art('6º')])
    expect(f.foraDeOrdem.map((x) => x.rotulo)).toEqual(['Art. 3º'])
    expect(f.severidade).toBe('revisar')
  })

  it('lei sem capítulos (>=10 artigos) = revisar', () => {
    const d = diagnosticarIndice(Array.from({ length: 12 }, (_, i) => art(`${i + 1}º`)))
    expect(d.artigosSemEstrutura).toBe(true)
    expect(d.severidade).toBe('revisar')
    expect(d.pendencias.map((p) => p.codigo)).toContain('artigos_sem_estrutura')
  })

  it('capítulo sem artigo', () => {
    const d = diagnosticarIndice([est('capitulo', 'Capítulo I'), art('1º'), art('2º'), art('3º'), est('capitulo', 'Capítulo II'), est('capitulo', 'Capítulo III'), art('4º')])
    expect(d.capitulosSemArtigo.map((c) => c.rotulo)).toEqual(['Capítulo II'])
    expect(d.severidade).toBe('revisar')
  })

  it('aula com citações = ok', () => {
    const d = diagnosticarIndice([
      { uid: 'a', tipo: 'titulo', rotulo: null, texto: 'Aula 1' }, par(), par(), { uid: 'c', tipo: 'paragrafo', rotulo: null, texto: 'Art. 5º, II, CF;' },
      art('5º'), par(),
    ])
    expect(d.severidade).toBe('ok')
    expect(d.totalArtigos).toBe(1)
    expect(d.artigosSemEstrutura).toBe(false)
  })

  it('sem trechos = ok com pendência informativa', () => {
    const d = diagnosticarIndice([])
    expect(d.severidade).toBe('ok')
    expect(d.pendencias[0].codigo).toBe('sem_trechos')
  })
})
