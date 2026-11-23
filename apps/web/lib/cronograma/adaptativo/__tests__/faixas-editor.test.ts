import { describe, it, expect } from 'vitest'
import { FAIXAS_PADRAO, MAX_FAIXAS, validarFaixas } from '../faixas-carga'
import { adicionarFaixa, ajustarMaximo, removerFaixa, segmentosLinha, definirOverride, lerOverride, contarOverrides, separarCaminhoOverride, rotuloDiffFaixa, dividirMinutos, juntarMinutos, nomeAutomatico } from '../faixas-editor'

describe('faixas-editor', () => {
  it('ajustarMaximo mantém encadeamento e não muta', () => {
    const r = ajustarMaximo(FAIXAS_PADRAO, 0, 900)
    expect(r[0].maxMin).toBe(900)
    expect(r[1].minMin).toBe(901)
    expect(FAIXAS_PADRAO[0].maxMin).toBe(870)
    expect(validarFaixas(r)).toEqual([])
    expect(r[0].nome).toBe('10h–14h30') // nome personalizado (≠ automático) é preservado
    const auto = ajustarMaximo([{ ...FAIXAS_PADRAO[0], nome: '0h–14h30' }, FAIXAS_PADRAO[3]], 0, 900)
    expect(auto[0].nome).toBe('0h–15h')
  })
  it('ajustarMaximo limita ao intervalo válido', () => {
    const r = ajustarMaximo(FAIXAS_PADRAO, 0, 99999)
    expect(r[0].maxMin).toBe(1469)
    expect(validarFaixas(r)).toEqual([])
    expect(ajustarMaximo(FAIXAS_PADRAO, 1, 10)[1].maxMin).toBe(871)
    expect(ajustarMaximo(FAIXAS_PADRAO, 3, 5000)[3].maxMin).toBeNull()
  })
  it('adicionarFaixa divide a última e gera lista válida', () => {
    const r = adicionarFaixa(FAIXAS_PADRAO)
    expect(r).toHaveLength(5)
    expect(validarFaixas(r)).toEqual([])
    expect(r[4].maxMin).toBeNull()
    expect(r[3].maxMin).toBe(2400)
    expect(new Set(r.map((f) => f.id)).size).toBe(5)
  })
  it('adicionarFaixa respeita o máximo e parte de 1 faixa', () => {
    let l = adicionarFaixa([{ ...FAIXAS_PADRAO[0], maxMin: null }])
    expect(validarFaixas(l)).toEqual([])
    for (let i = 0; i < 20; i++) l = adicionarFaixa(l)
    expect(l.length).toBe(MAX_FAIXAS)
    expect(validarFaixas(l)).toEqual([])
  })
  it('removerFaixa: meio, última, primeira e mínimo 1', () => {
    const m = removerFaixa(FAIXAS_PADRAO, 1)
    expect(m).toHaveLength(3); expect(validarFaixas(m)).toEqual([])
    expect(m[1].minMin).toBe(871)
    const u = removerFaixa(FAIXAS_PADRAO, 3)
    expect(u[2].maxMin).toBeNull(); expect(validarFaixas(u)).toEqual([])
    const p = removerFaixa(FAIXAS_PADRAO, 0)
    expect(p[0].minMin).toBe(0); expect(validarFaixas(p)).toEqual([])
    expect(removerFaixa([FAIXAS_PADRAO[0]], 0)).toHaveLength(1)
  })
  it('segmentosLinha soma 100% e a última é aberta', () => {
    const s = segmentosLinha(FAIXAS_PADRAO)
    expect(s.reduce((a, x) => a + x.pct, 0)).toBeCloseTo(100, 5)
    expect(s[3].aberta).toBe(true)
    expect(s[0].pct).toBeGreaterThan(0)
  })
  it('overrides: define, lê, conta e limpa removendo chaves vazias', () => {
    const a = definirOverride(FAIXAS_PADRAO, 1, 'limitesDia.questoes', 3)
    expect(lerOverride(a[1], 'limitesDia.questoes')).toBe(3)
    expect(contarOverrides(a[1])).toBe(1)
    expect(FAIXAS_PADRAO[1].overrides).toEqual({})
    const b = definirOverride(a, 1, 'limitesDia.questoes', undefined)
    expect(b[1].overrides).toEqual({})
    expect(contarOverrides(b[1])).toBe(0)
  })
  it('separarCaminhoOverride', () => {
    expect(separarCaminhoOverride('limitesDia.questoes')).toEqual({ secao: 'limitesDia', campo: 'questoes' })
    expect(separarCaminhoOverride('constantes.blocoMin')).toBeNull()
    expect(separarCaminhoOverride('revisao.antecipaMinSemanas.fl')).toBeNull()
  })
  it('rotuloDiffFaixa', () => {
    const fb = (p: string) => p
    const nc = (p: string) => (p === 'limitesDia.questoes' ? 'Questões por dia' : undefined)
    expect(rotuloDiffFaixa('faixas.1.overrides.limitesDia.questoes', fb, nc)).toBe('Faixa 2 (override): Questões por dia')
    expect(rotuloDiffFaixa('faixas.0.tetoPdf', fb, nc, () => 'Leve')).toBe('Leve: teto de PDFull novo/semana')
    expect(rotuloDiffFaixa('horizonte.maxSemanas', fb, nc)).toBe('horizonte.maxSemanas')
  })
  it('minutos e nome automático', () => {
    expect(dividirMinutos(870)).toEqual({ h: 14, m: 30 })
    expect(juntarMinutos(14, 30)).toBe(870)
    expect(nomeAutomatico(FAIXAS_PADRAO, 1)).toBe('15h–24h30')
    expect(nomeAutomatico(FAIXAS_PADRAO, 3)).toBe('Acima de 35h')
  })
})
