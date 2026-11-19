import { describe, expect, it } from 'vitest'
import {
  LIMITES_FOLHA, confirmarDesde, substituirPresente, adicionarCaixa, adicionarTraco, apagarEm, criarFolhaVazia, criarHistorico, desfazer, expandirSeNecessario,
  moverCaixa, redimensionarCaixa, refazer, registrar, removerCaixa, serializarFolha, simplificarPontos, tracoAtingido,
  validarFolha, type Ponto, type TracoFolha,
} from './notebook-folha'

const traco = (id: string, pts: Ponto[], largura = 2): TracoFolha => ({ id, ferramenta: 'caneta', cor: 'tinta', largura, pontos: pts })

describe('simplificarPontos (RDP)', () => {
  it('remove pontos colineares e preserva extremos', () => {
    const pts: Ponto[] = [[0, 0, 0.5], [5, 0.1, 0.5], [10, 0, 0.5], [20, 0, 0.9]]
    const r = simplificarPontos(pts, 1)
    expect(r).toEqual([[0, 0, 0.5], [20, 0, 0.9]])
  })
  it('mantém curvas acentuadas', () => {
    const pts: Ponto[] = [[0, 0, 1], [10, 10, 1], [20, 0, 1]]
    expect(simplificarPontos(pts, 1)).toHaveLength(3)
  })
  it('aguenta 20 mil pontos sem estourar a pilha', () => {
    const pts: Ponto[] = Array.from({ length: 20000 }, (_, i) => [i, Math.sin(i / 50) * 20, 0.5])
    expect(simplificarPontos(pts, 0.5).length).toBeLessThan(20000)
  })
})

describe('borracha', () => {
  const t = traco('a', [[0, 0, 1], [100, 0, 1]], 4)
  it('acerta por segmento (meio do segmento, sem ponto lá)', () => {
    expect(tracoAtingido(t, 50, 3, 2)).toBe(true)
    expect(tracoAtingido(t, 50, 20, 2)).toBe(false)
    expect(tracoAtingido(t, 150, 0, 2)).toBe(false)
  })
  it('apagarEm remove só os atingidos e devolve a mesma ref se nada', () => {
    const f = adicionarTraco(adicionarTraco(criarFolhaVazia(), t), traco('b', [[0, 500, 1], [100, 500, 1]]))
    expect(apagarEm(f, 50, 0, 2).tracos.map((x) => x.id)).toEqual(['b'])
    expect(apagarEm(f, 50, 250, 2)).toBe(f)
  })
})

describe('caixas (imutável)', () => {
  it('adiciona, move, redimensiona e remove sem mutar', () => {
    const f0 = criarFolhaVazia(1000, 1000)
    const f1 = adicionarCaixa(f0, { id: 'c1', x: 10, y: 10 })
    expect(f0.caixas).toHaveLength(0)
    const f2 = moverCaixa(f1, 'c1', 5000, 30)
    expect(f2.caixas[0].x).toBe(1000 - f2.caixas[0].w) // limitado à largura
    expect(f1.caixas[0].x).toBe(10)
    const f3 = redimensionarCaixa(f2, 'c1', 1, 1)
    expect(f3.caixas[0].w).toBe(40)
    expect(removerCaixa(f3, 'c1').caixas).toHaveLength(0)
    expect(moverCaixa(f3, 'nao-existe', 1, 1)).toBe(f3)
  })
  it('respeita limite de caixas e z crescente', () => {
    let f = criarFolhaVazia()
    for (let i = 0; i < LIMITES_FOLHA.caixas + 5; i++) f = adicionarCaixa(f, { id: 'c' + i, x: 0, y: 0 })
    expect(f.caixas).toHaveLength(LIMITES_FOLHA.caixas)
    expect(f.caixas[1].z).toBeGreaterThan(f.caixas[0].z)
  })
})

describe('histórico', () => {
  it('desfaz/refaz e descarta futuro ao registrar', () => {
    const f0 = criarFolhaVazia()
    let h = criarHistorico(f0)
    const f1 = adicionarCaixa(f0, { id: 'a', x: 0, y: 0 })
    const f2 = adicionarCaixa(f1, { id: 'b', x: 0, y: 0 })
    h = registrar(registrar(h, f1), f2)
    h = desfazer(h)
    expect(h.presente).toBe(f1)
    h = refazer(h)
    expect(h.presente).toBe(f2)
    h = desfazer(desfazer(h))
    expect(h.presente).toBe(f0)
    h = registrar(h, f1)
    expect(h.futuro).toHaveLength(0)
  })
  it('confirmarDesde junta edição contínua em 1 passo', () => {
    const f0 = criarFolhaVazia()
    let h = criarHistorico(adicionarCaixa(f0, { id: 'a', x: 0, y: 0 }))
    const antes = h.presente
    h = substituirPresente(h, moverCaixa(h.presente, 'a', 5, 5))
    h = substituirPresente(h, moverCaixa(h.presente, 'a', 9, 9))
    expect(h.passado).toHaveLength(0)
    h = confirmarDesde(h, antes)
    expect(h.passado).toEqual([antes])
    expect(desfazer(h).presente).toBe(antes)
  })
  it('limita a pilha', () => {
    let h = criarHistorico(criarFolhaVazia())
    for (let i = 0; i < 80; i++) h = registrar(h, { ...h.presente, altura: 1600 + i + 1 })
    expect(h.passado.length).toBe(LIMITES_FOLHA.historico)
  })
})

describe('validação e limites', () => {
  it('ida e volta compacta', () => {
    const f = adicionarTraco(criarFolhaVazia(), traco('a', [[1.234, 2.345, 0.5678], [10, 20, 1]]))
    const s = serializarFolha(f)
    const v = validarFolha(s)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.folha.tracos[0].pontos[0]).toEqual([1.2, 2.3, 0.57])
  })
  it('rejeita cor fora da paleta, versão errada e NaN', () => {
    const base = adicionarTraco(criarFolhaVazia(), traco('a', [[1, 1, 1]]))
    expect(validarFolha({ ...base, tracos: [{ ...base.tracos[0], cor: '#ff0000' }] }).ok).toBe(false)
    expect(validarFolha({ ...base, versao: 2 }).ok).toBe(false)
    expect(validarFolha({ ...base, tracos: [{ ...base.tracos[0], pontos: [[NaN, 0, 1]] }] }).ok).toBe(false)
  })
  it('rejeita >5000 traços e >20000 pontos', () => {
    const f = criarFolhaVazia()
    const muitos = Array.from({ length: LIMITES_FOLHA.tracos + 1 }, (_, i) => traco('t' + i, [[0, 0, 1]]))
    expect(validarFolha({ ...f, tracos: muitos }).ok).toBe(false)
    const pts: Ponto[] = Array.from({ length: LIMITES_FOLHA.pontosPorTraco + 1 }, () => [0, 0, 1])
    expect(validarFolha({ ...f, tracos: [traco('x', pts)] }).ok).toBe(false)
  })
  it('rejeita acima de 1 MB e adicionarTraco recusa estourar', () => {
    const f = criarFolhaVazia()
    const texto = 'a'.repeat(LIMITES_FOLHA.textoCaixa)
    const caixas = Array.from({ length: 60 }, (_, i) => ({ id: 'c' + i, x: 0, y: 0, w: 100, h: 100, z: i, texto }))
    expect(validarFolha({ ...f, caixas }).ok).toBe(false)
    const cheia = { ...f, caixas: caixas.slice(0, 49) }
    const grande = traco('g', Array.from({ length: 15000 }, (_, i) => [i, i, 0.5] as Ponto))
    expect(adicionarTraco(cheia, grande)).toBe(cheia)
  })
})

describe('expandirSeNecessario', () => {
  it('cresce a altura quando o conteúdo chega perto do fim', () => {
    const f = adicionarTraco(criarFolhaVazia(1200, 1000), traco('a', [[0, 900, 1], [0, 950, 1]]))
    expect(expandirSeNecessario(f).altura).toBeGreaterThan(1000)
    expect(expandirSeNecessario(criarFolhaVazia())).toEqual(criarFolhaVazia())
  })
})
