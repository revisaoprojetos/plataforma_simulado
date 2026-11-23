// ONDA 2b — tinta como objeto: laço, borracha por traço/área, mover/redimensionar, serialização v1->v2, tela infinita.
import { describe, expect, it } from 'vitest'
import {
  FOLHA_VERSAO, LIMITES_FOLHA, adicionarCaixa, adicionarTraco, apagarArea, bboxTracos, corParaVar, crescerPara, criarFolhaVazia, criarHistorico,
  desfazer, dividirTraco, escalarTracos, expandirSeNecessario, intervaloNoCirculo, limitarMovimento, migrarFolha, moverCaixa, moverTracos, pontoNoPoligono,
  refazer, registrar, rgbDeHex, serializarFolha, tracosNoLaco, validarFolha, type Ponto, type TracoFolha,
} from './notebook-folha'

const traco = (id: string, pts: Ponto[], largura = 2): TracoFolha => ({ id, ferramenta: 'caneta', cor: 'tinta', largura, pontos: pts })
let seq = 0
const novoId = () => 'n' + ++seq

describe('serialização versionada (v1/v2 -> v3)', () => {
  it('folha nova é v3; v1 antiga abre e é normalizada para v3', () => {
    expect(criarFolhaVazia().versao).toBe(FOLHA_VERSAO)
    const v1 = { versao: 1, largura: 1200, altura: 1600, caixas: [], tracos: [{ id: 'a', ferramenta: 'caneta', cor: 'azul', largura: 3, pontos: [[1, 2, 0.5], [3, 4, 0.5]] }] }
    const r = validarFolha(v1)
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.folha.versao).toBe(3); expect(r.folha.tracos[0].cor).toBe('azul') }
  })
  it('aceita cor hex #rrggbb (v2) e preserva na ida e volta', () => {
    const f = adicionarTraco(criarFolhaVazia(), { ...traco('a', [[1, 1, 1], [5, 5, 1]]), cor: '#2f6fd1' })
    const r = validarFolha(serializarFolha(f))
    expect(r.ok && r.folha.tracos[0].cor).toBe('#2f6fd1')
  })
  it('migrarFolha é idempotente (mesma ref se já v3)', () => {
    const f = criarFolhaVazia()
    expect(migrarFolha(f)).toBe(f)
    expect(migrarFolha({ ...f, versao: 1 }).versao).toBe(3)
  })
  it('corParaVar: paleta -> var, hex passa, lixo -> tinta padrão; rgbDeHex', () => {
    expect(corParaVar('azul')).toBe('var(--folha-cor-azul)')
    expect(corParaVar('#AABBCC')).toBe('#AABBCC')
    expect(corParaVar('red; background:url(x)')).toBe('var(--folha-cor-tinta)')
    expect(rgbDeHex('#ff0000')).toEqual([1, 0, 0])
    expect(rgbDeHex('ff0000')).toBeNull()
  })
})

describe('laço (seleção de tinta)', () => {
  const quadrado: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100]]
  it('pontoNoPoligono (côncavo incluso)', () => {
    expect(pontoNoPoligono(50, 50, quadrado)).toBe(true)
    expect(pontoNoPoligono(150, 50, quadrado)).toBe(false)
    const L: Array<[number, number]> = [[0, 0], [100, 0], [100, 40], [40, 40], [40, 100], [0, 100]]
    expect(pontoNoPoligono(20, 80, L)).toBe(true)
    expect(pontoNoPoligono(80, 80, L)).toBe(false)
  })
  it('seleciona traços com >= metade dos pontos dentro; ignora fora e laço degenerado', () => {
    const dentro = traco('dentro', [[10, 10, 1], [50, 50, 1], [90, 90, 1]])
    const fora = traco('fora', [[200, 200, 1], [300, 300, 1]])
    const metade = traco('metade', [[50, 50, 1], [60, 60, 1], [150, 150, 1], [160, 160, 1]])
    const pouco = traco('pouco', [[50, 50, 1], [150, 150, 1], [160, 160, 1], [170, 170, 1]])
    expect(tracosNoLaco([dentro, fora, metade, pouco], quadrado).sort()).toEqual(['dentro', 'metade'])
    expect(tracosNoLaco([dentro], [[0, 0], [10, 10]])).toEqual([])
  })
})

describe('borracha por traço/área', () => {
  it('intervaloNoCirculo: corda, fora e segmento degenerado', () => {
    expect(intervaloNoCirculo([-10, 0, 1], [10, 0, 1], 0, 0, 5)).toEqual([0.25, 0.75])
    expect(intervaloNoCirculo([-10, 20, 1], [10, 20, 1], 0, 0, 5)).toBeNull()
    expect(intervaloNoCirculo([0, 0, 1], [0, 0, 1], 1, 0, 5)).toEqual([0, 1])
  })
  it('dividirTraco corta o meio e devolve dois pedaços (1º mantém o id)', () => {
    const t = traco('a', [[0, 0, 1], [100, 0, 1]], 0.5)
    const r = dividirTraco(t, 50, 0, 10, novoId)!
    expect(r).toHaveLength(2)
    expect(r[0].id).toBe('a')
    expect(r[1].id).not.toBe('a')
    expect(r[0].pontos[r[0].pontos.length - 1][0]).toBeCloseTo(50 - 10.25, 1)
    expect(r[1].pontos[0][0]).toBeCloseTo(50 + 10.25, 1)
  })
  it('dividirTraco: ponta apagada encurta; tudo dentro -> []; longe -> null; ponto isolado', () => {
    const t = traco('a', [[0, 0, 1], [100, 0, 1]], 0.5)
    expect(dividirTraco(t, 0, 0, 10, novoId)!).toHaveLength(1)
    expect(dividirTraco(t, 50, 0, 200, novoId)).toEqual([])
    expect(dividirTraco(t, 50, 100, 10, novoId)).toBeNull()
    expect(dividirTraco(traco('p', [[5, 5, 1]]), 5, 5, 3, novoId)).toEqual([])
    expect(dividirTraco(traco('p', [[50, 50, 1]]), 5, 5, 3, novoId)).toBeNull()
  })
  it('dividirTraco em polilinha com curva: sobram trecho de cima e de baixo', () => {
    const t = traco('z', [[0, 0, 1], [50, 0, 1], [50, 50, 1], [0, 50, 1]], 0.5)
    expect(dividirTraco(t, 50, 25, 5, novoId)!).toHaveLength(2)
  })
  it('apagarArea: divide só os tocados, mesma ref sem toque, respeita limite de traços', () => {
    const a = traco('a', [[0, 0, 1], [100, 0, 1]], 0.5)
    const b = traco('b', [[0, 500, 1], [100, 500, 1]], 0.5)
    const f = adicionarTraco(adicionarTraco(criarFolhaVazia(), a), b)
    const g = apagarArea(f, 50, 0, 10, novoId)
    expect(g.tracos.filter((t) => t.id === 'b')).toHaveLength(1)
    expect(g.tracos).toHaveLength(3)
    expect(f.tracos).toHaveLength(2) // imutável
    expect(apagarArea(f, 50, 250, 10, novoId)).toBe(f)
    const cheia = { ...criarFolhaVazia(), tracos: Array.from({ length: LIMITES_FOLHA.tracos }, (_, i) => traco('t' + i, [[0, i, 1], [100, i, 1]])) }
    expect(apagarArea(cheia, 50, 0, 10, novoId)).toBe(cheia) // dividir estouraria o limite
  })
})

describe('mover e redimensionar tinta', () => {
  const a = traco('a', [[10, 10, 1], [30, 10, 1]], 2)
  const b = traco('b', [[100, 100, 1], [120, 100, 1]], 2)
  const f = adicionarTraco(adicionarTraco(criarFolhaVazia(), a), b)
  it('moverTracos desloca só a seleção, sem mutar, e não sai do canto (coords >= 0)', () => {
    const g = moverTracos(f, ['a'], 5, 7)
    expect(g.tracos[0].pontos[0]).toEqual([15, 17, 1])
    expect(g.tracos[1]).toBe(f.tracos[1])
    expect(f.tracos[0].pontos[0]).toEqual([10, 10, 1])
    expect(moverTracos(f, ['a'], -500, -500).tracos[0].pontos[0]).toEqual([0, 0, 1])
    expect(limitarMovimento([a], -500, 3)).toEqual([-10, 3])
    expect(moverTracos(f, ['nada'], 5, 5)).toBe(f)
  })
  it('escalarTracos em torno da âncora; espessura acompanha; limites; sx/sy inválidos = no-op', () => {
    const g = escalarTracos(f, ['a'], 10, 10, 2, 2)
    expect(g.tracos[0].pontos[1]).toEqual([50, 10, 1])
    expect(g.tracos[0].largura).toBe(4)
    expect(escalarTracos(f, ['a'], 0, 0, 1, 1)).toBe(f)
    expect(escalarTracos(f, ['a'], 0, 0, -1, 1)).toBe(f)
    expect(escalarTracos(f, ['a'], 0, 0, 1000, 1000).tracos[0].largura).toBeLessThanOrEqual(80)
  })
  it('bboxTracos inclui a meia espessura; desfazer/refazer de tinta pelo histórico', () => {
    expect(bboxTracos([a])).toEqual({ x0: 9, y0: 9, x1: 31, y1: 11 })
    expect(bboxTracos([])).toBeNull()
    let h = criarHistorico(f)
    h = registrar(h, moverTracos(h.presente, ['a'], 5, 5))
    h = registrar(h, apagarArea(h.presente, 115, 100, 5, novoId))
    expect(desfazer(desfazer(h)).presente).toBe(f)
    expect(refazer(desfazer(h)).presente).toBe(h.presente)
  })
})

describe('tela infinita', () => {
  it('cresce também na largura e nunca encolhe', () => {
    const f = adicionarTraco(criarFolhaVazia(1200, 1600), traco('a', [[1100, 10, 1], [1150, 20, 1]]))
    const g = expandirSeNecessario(f)
    expect(g.largura).toBeGreaterThan(1200)
    expect(g.altura).toBe(1600)
    expect(crescerPara(g, 10, 10)).toBe(g)
    expect(crescerPara(criarFolhaVazia(1200, 1600), 5000, 100).largura).toBeGreaterThanOrEqual(5200)
  })
  it('caixa/traço no modo livre passa da largura atual; modo antigo continua limitado', () => {
    const f = criarFolhaVazia(1000, 1000)
    const livre = adicionarCaixa(f, { id: 'c', x: 1500, y: 10, livre: true })
    expect(livre.caixas[0].x).toBe(1500)
    expect(expandirSeNecessario(livre).largura).toBeGreaterThan(1500)
    expect(adicionarCaixa(f, { id: 'c', x: 1500, y: 10 }).caixas[0].x).toBe(960)
    expect(moverCaixa(livre, 'c', 3000, 0, true).caixas[0].x).toBe(3000)
    expect(moverCaixa(livre, 'c', 3000, 0).caixas[0].x).toBe(1000 - livre.caixas[0].w)
  })
})
