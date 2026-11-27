import { describe, expect, it } from 'vitest'
import {
  AlteracaoRegrasSchema, CriarTipoSchema, EdicaoTipoSchema, SalvarRegrasSchema, agruparAlteracoes, aplicarPatchRegras, corValida,
  filtroTipoValido, ordemTipoValida, podeApagar, regrasVazias, slugDeNome, slugLivre,
} from '../gestao'
import { calcularMinutos, resolverRegras } from '../cascata'

const ID = '11111111-1111-4111-8111-111111111111'

describe('podeApagar', () => {
  const livre = { documentos: 0, pastas: 0, metas: 0, regras: 0 }
  it('sistema nunca apaga', () => { expect(podeApagar({ sistema: true }, livre).ok).toBe(false) })
  it('uso desconhecido bloqueia', () => { expect(podeApagar({ sistema: false }, null).ok).toBe(false) })
  it('em uso bloqueia e explica', () => {
    const r = podeApagar({ sistema: false }, { ...livre, documentos: 3, pastas: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.motivo).toContain('3 documento'); expect(r.motivo).toContain('1 pasta') }
  })
  it('personalizada sem uso apaga; regras só avisam', () => {
    const r = podeApagar({ sistema: false }, { ...livre, regras: 2 })
    expect(r).toEqual({ ok: true, avisoRegras: 2 })
  })
})

describe('slug e cor', () => {
  it('slugDeNome normaliza', () => { expect(slugDeNome('Mapa Mental Ç')).toBe('mapa-mental-c'); expect(slugDeNome('!')).toMatch(/^classe-/) })
  it('slugLivre evita colisão e slugs de sistema', () => {
    expect(slugLivre('mapa', new Set(['mapa']))).toBe('mapa-2')
    expect(slugLivre('pdfull', new Set())).toBe('pdfull-2')
    expect(slugLivre('x'.repeat(40), new Set(['x'.repeat(40)])).length).toBeLessThanOrEqual(40)
  })
  it('corValida só aceita token ou o valor legado', () => {
    expect(corValida('var(--chart-1)')).toBe('var(--chart-1)')
    expect(corValida('#ff0000')).toBeUndefined()
    expect(corValida('#ff0000', '#ff0000')).toBe('#ff0000')
    expect(corValida('')).toBeNull()
    expect(corValida(undefined)).toBeUndefined()
  })
  it('filtros e ordens inválidos caem no padrão', () => { expect(filtroTipoValido('x')).toBe('todas'); expect(ordemTipoValida('drop')).toBe('ordem') })
})

describe('schemas', () => {
  it('criar exige nome e rejeita campos extras', () => {
    expect(CriarTipoSchema.safeParse({ nome: 'Mapa' }).success).toBe(true)
    expect(CriarTipoSchema.safeParse({}).success).toBe(false)
    expect(CriarTipoSchema.safeParse({ nome: 'a', sistema: true }).success).toBe(false)
    expect(CriarTipoSchema.safeParse({ nome: 'a', slug: 'Maiusc' }).success).toBe(false)
  })
  it('edição valida papel e limites', () => {
    expect(EdicaoTipoSchema.safeParse({ papel: 'apoio', ordem: 3 }).success).toBe(true)
    expect(EdicaoTipoSchema.safeParse({ papel: 'xx' }).success).toBe(false)
    expect(EdicaoTipoSchema.safeParse({ tenant_id: 'x' }).success).toBe(false)
    expect(EdicaoTipoSchema.safeParse({ exibicao: { legenda: true, indice: { nivel_max: 9 } } }).success).toBe(false)
  })
  it('alteração de regras: área e campos conhecidos; null permitido', () => {
    expect(AlteracaoRegrasSchema.safeParse({ area: 'adaptativo', classificacaoId: ID, patch: { tempo: { modo: 'fixo', minutos_fixo: 30 }, meta: { qtd_semana: null } } }).success).toBe(true)
    expect(AlteracaoRegrasSchema.safeParse({ area: 'outra', classificacaoId: ID }).success).toBe(false)
    expect(AlteracaoRegrasSchema.safeParse({ area: 'gerador', classificacaoId: ID, patch: { tempo: { modo: 'xx' } } }).success).toBe(false)
    expect(AlteracaoRegrasSchema.safeParse({ area: 'gerador', classificacaoId: ID, patch: { tempo: { inventado: 1 } } }).success).toBe(false)
    expect(SalvarRegrasSchema.safeParse({ alteracoes: [] }).success).toBe(false)
  })
})

describe('patch de regras de uso', () => {
  it('define, sobrescreve e remove com null', () => {
    const a = aplicarPatchRegras({}, { tempo: { modo: 'por_pagina', min_por_pagina: 3 }, meta: { gera_meta: true } })
    expect(a.tempo).toEqual({ modo: 'por_pagina', min_por_pagina: 3 }); expect(a.meta).toEqual({ gera_meta: true })
    const b = aplicarPatchRegras(a, { tempo: { min_por_pagina: null } })
    expect(b.tempo).toEqual({ modo: 'por_pagina' })
    const c = aplicarPatchRegras(b, { tempo: { modo: null }, meta: { gera_meta: null } })
    expect(regrasVazias(c)).toBe(true)
  })
  it('limpar zera tudo e dado inválido gravado é descartado', () => {
    expect(regrasVazias(aplicarPatchRegras({ tempo: { modo: 'fixo' } }, undefined, true))).toBe(true)
    expect(aplicarPatchRegras({ tempo: { modo: 'lixo', minutos_fixo: 10 } }, undefined).tempo).toEqual({ minutos_fixo: 10 })
  })
  it('agrupa alterações do mesmo alvo na ordem', () => {
    const m = agruparAlteracoes([
      { area: 'gerador', classificacaoId: ID, patch: { tempo: { modo: 'fixo' } } },
      { area: 'gerador', classificacaoId: ID, patch: { tempo: { minutos_fixo: 20 } } },
      { area: 'adaptativo', classificacaoId: ID, limpar: true },
    ])
    expect(m.size).toBe(2)
    expect(m.get(`gerador:${ID}`)!.patch.tempo).toEqual({ modo: 'fixo', minutos_fixo: 20 })
    expect(m.get(`adaptativo:${ID}`)!.limpar).toBe(true)
  })
})

describe('cascata + tempo no servidor', () => {
  it('regra da área vence o padrão do motor; sem regra = herdado', () => {
    const herdado = resolverRegras({ padraoMotor: { tempo: { modo: 'por_pagina', min_por_pagina: 2 }, meta: {} } })
    expect(herdado.origem['tempo.modo']).toBe('padrao')
    expect(calcularMinutos(herdado.regras, { paginas: 10 })).toBe(20)
    const area = resolverRegras({ usoAreaClassificacao: { tempo: { modo: 'fixo', minutos_fixo: 45 }, meta: {} }, padraoMotor: { tempo: { modo: 'por_pagina' }, meta: {} } })
    expect(area.origem['tempo.modo']).toBe('area')
    expect(calcularMinutos(area.regras, { paginas: 10 })).toBe(45)
  })
  it('meta (override) vence a regra da área', () => {
    const r = resolverRegras({ override: { tempo: { modo: 'fixo', minutos_fixo: 5 }, meta: {} }, usoAreaClassificacao: { tempo: { modo: 'fixo', minutos_fixo: 45 }, meta: {} } })
    expect(r.origem['tempo.minutos_fixo']).toBe('meta'); expect(calcularMinutos(r.regras, {})).toBe(5)
  })
  it('medida ausente ou modo manual não chuta', () => {
    expect(calcularMinutos({ tempo: { ...resolverRegras({}).regras.tempo, modo: 'por_pagina' } }, {})).toBeNull()
    expect(calcularMinutos({ tempo: { ...resolverRegras({}).regras.tempo, modo: 'manual' } }, { paginas: 3 })).toBeNull()
  })
})
