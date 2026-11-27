import { describe, it, expect } from 'vitest'
import { ExibicaoClassificacaoSchema, REGRAS_USO_PADRAO, lerExibicao, lerRegrasParciais, RegrasUsoSchema } from '../esquema'
import { calcularMinutos, resolverRegras } from '../cascata'
import { resolverClassificacaoDoc } from '../heranca'

describe('esquema', () => {
  it('exibicao {} vira defaults; inválido não lança', () => {
    const e = lerExibicao({})
    expect(e.indice.nivel_max).toBe(4)
    expect(e.legenda).toBe(false)
    expect(lerExibicao({ indice: { nivel_max: 99 } }).indice.nivel_max).toBe(4)
    expect(lerExibicao(null).versao).toBe(1)
  })
  it('formato_leitura exige slug', () => {
    expect(ExibicaoClassificacaoSchema.safeParse({ formato_leitura: 'Texto Ruim' }).success).toBe(false)
    expect(ExibicaoClassificacaoSchema.safeParse({ formato_leitura: 'legproc-texto' }).success).toBe(true)
  })
  it('regras parciais: campo inválido é descartado sem derrubar os outros', () => {
    const r = lerRegrasParciais({ tempo: { modo: 'xx', minutos_fixo: 20 }, meta: { qtd_semana: -1, gera_meta: true } })
    expect(r.tempo).toEqual({ minutos_fixo: 20 })
    expect(r.meta).toEqual({ gera_meta: true })
  })
  it('padrão interno é válido', () => {
    expect(RegrasUsoSchema.safeParse(REGRAS_USO_PADRAO).success).toBe(true)
  })
})

describe('cascata', () => {
  it('meta > area > padrao motor > padrão interno, com origem', () => {
    const { regras, origem } = resolverRegras({
      override: { tempo: { modo: 'fixo', minutos_fixo: 15 } },
      usoAreaClassificacao: { tempo: { modo: 'por_pagina', min_por_pagina: 3 }, meta: { gera_meta: true } },
      padraoMotor: { meta: { qtd_semana: 4 } },
    })
    expect(regras.tempo.modo).toBe('fixo'); expect(origem['tempo.modo']).toBe('meta')
    expect(regras.tempo.minutos_fixo).toBe(15); expect(origem['tempo.minutos_fixo']).toBe('meta')
    expect(regras.tempo.min_por_pagina).toBe(3); expect(origem['tempo.min_por_pagina']).toBe('area')
    expect(regras.meta.gera_meta).toBe(true); expect(origem['meta.gera_meta']).toBe('area')
    expect(regras.meta.qtd_semana).toBe(4); expect(origem['meta.qtd_semana']).toBe('padrao')
    expect(regras.tempo.palavras_por_min).toBe(200); expect(origem['tempo.palavras_por_min']).toBe('padrao')
  })
  it('sem nenhuma camada = padrão interno, tudo origem padrao', () => {
    const { regras, origem } = resolverRegras({})
    expect(regras).toEqual(REGRAS_USO_PADRAO)
    expect(Object.values(origem).every((o) => o === 'padrao')).toBe(true)
  })
  it('não muta o padrão interno', () => {
    resolverRegras({ override: { meta: { qtd_semana: 9 } } })
    expect(REGRAS_USO_PADRAO.meta.qtd_semana).toBe(1)
  })
})

describe('calcularMinutos', () => {
  const com = (tempo: Record<string, unknown>) => resolverRegras({ override: { tempo } }).regras
  it('por_pagina / palavras / artigo / caracteres / fixo', () => {
    expect(calcularMinutos(com({ modo: 'por_pagina', min_por_pagina: 1.5 }), { paginas: 10 })).toBe(15)
    expect(calcularMinutos(com({ modo: 'por_palavras' }), { palavras: 2500 })).toBe(13) // 12,5 → 13
    expect(calcularMinutos(com({ modo: 'por_artigo', min_por_artigo: 2 }), { artigos: 7 })).toBe(14)
    expect(calcularMinutos(com({ modo: 'por_caracteres', caracteres_por_min: 1000 }), { caracteres: 12000 })).toBe(12)
    expect(calcularMinutos(com({ modo: 'fixo', minutos_fixo: 45 }), {})).toBe(45)
  })
  it('mínimo 1', () => {
    expect(calcularMinutos(com({ modo: 'por_palavras' }), { palavras: 10 })).toBe(1)
  })
  it('manual ou medida ausente/0 → null (pendência)', () => {
    expect(calcularMinutos(com({ modo: 'manual' }), { paginas: 5 })).toBeNull()
    expect(calcularMinutos(com({ modo: 'por_pagina' }), { paginas: null })).toBeNull()
    expect(calcularMinutos(com({ modo: 'por_artigo' }), { artigos: 0 })).toBeNull()
  })
})

describe('heranca', () => {
  const cat = [{ id: 'c1', n: 'PDFull' }, { id: 'c2', n: 'LegProc' }]
  it('documento vence', () => {
    const r = resolverClassificacaoDoc({ docClassId: 'c2', pastasAncestrais: [{ id: 'p1', classificacaoId: 'c1' }], catalogo: cat })
    expect(r.classificacao?.id).toBe('c2'); expect(r.origem).toBe('documento')
  })
  it('NULL herda da pasta mais próxima', () => {
    const r = resolverClassificacaoDoc({
      docClassId: null,
      pastasAncestrais: [{ id: 'p1', classificacaoId: null }, { id: 'p2', classificacaoId: 'c2' }, { id: 'p3', classificacaoId: 'c1' }],
      catalogo: cat,
    })
    expect(r.classificacao?.id).toBe('c2'); expect(r.origem).toBe('pasta:p2')
  })
  it('sem classificação = nenhuma/pendente (não cai em pdfull)', () => {
    const r = resolverClassificacaoDoc({ docClassId: null, pastasAncestrais: [{ id: 'p1', classificacaoId: null }], catalogo: cat })
    expect(r).toEqual({ classificacao: null, origem: 'nenhuma', pendente: true })
  })
  it('fallbackLegado só quando informado', () => {
    const r = resolverClassificacaoDoc({ docClassId: null, pastasAncestrais: [], catalogo: cat, fallbackLegado: cat[0] })
    expect(r.origem).toBe('legado'); expect(r.classificacao?.id).toBe('c1'); expect(r.pendente).toBe(false)
  })
  it('id dangling é ignorado e segue acima; aceita Map', () => {
    const r = resolverClassificacaoDoc({
      docClassId: 'apagado', pastasAncestrais: [{ id: 'p1', classificacaoId: 'c1' }],
      catalogo: new Map(cat.map((c) => [c.id, c] as const)),
    })
    expect(r.origem).toBe('pasta:p1')
  })
})
