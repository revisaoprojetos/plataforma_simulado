import { describe, expect, it } from 'vitest'
import {
  AcaoDetalheSchema, abaDetalheValida, condicaoDocsDaClasse, diffResumo, montarSqlDocsDaClasse, origemDocValida, planoClonarRegras, slugComPartesDasMetas, sortDocsValido, subAbaPastasValida, trocarOrdem,
} from '../detalhe'

const ID = '11111111-1111-4111-8111-111111111111'
const OUTRA = '22222222-2222-4222-8222-222222222222'

describe('validadores de URL', () => {
  it('caem no padrão', () => {
    expect(abaDetalheValida('xx')).toBe('visao'); expect(abaDetalheValida('regras')).toBe('regras')
    expect(origemDocValida('?')).toBe('todas'); expect(sortDocsValido('pasta')).toBe('pasta'); expect(sortDocsValido('drop table')).toBe('titulo')
    expect(subAbaPastasValida('metas')).toBe('metas'); expect(subAbaPastasValida('x')).toBe('pastas')
  })
  it('atalho de partes só para legproc/pdflash/pdfight', () => {
    expect(slugComPartesDasMetas('legproc')).toBe(true); expect(slugComPartesDasMetas('pdfull')).toBe(false)
  })
})

describe('montarSqlDocsDaClasse', () => {
  const base = { tenantId: 't', classificacaoId: ID, pastasHerdam: ['p1', 'p2'], origem: 'todas' as const, limite: 25, offset: 50 }
  it('todas = própria OU herdada; parametriza tudo', () => {
    const { text, params } = montarSqlDocsDaClasse({ ...base, q: 'lei 8.112%' })
    expect(text).toContain('d.classificacao_id = $2::uuid')
    expect(text).toContain('d.classificacao_id IS NULL AND d.pasta_id = ANY($3::uuid[])')
    expect(text).toContain('LIMIT 25'); expect(text).toContain('OFFSET 50')
    expect(params.slice(0, 3)).toEqual(['t', ID, ['p1', 'p2']])
    expect(params[3]).toBe('%lei 8.112\\%%')
    expect(text).not.toContain('lei 8.112')
  })
  it('origem filtra e ordenação vem de lista fechada', () => {
    expect(condicaoDocsDaClasse('definida')).toBe('d.classificacao_id = $2::uuid')
    expect(condicaoDocsDaClasse('herdada')).toContain('IS NULL')
    expect(montarSqlDocsDaClasse({ ...base, sort: 'paginas', dir: 'desc' }).text).toContain('ORDER BY v.paginas DESC')
    expect(montarSqlDocsDaClasse({ ...base, sort: 'x' as never }).text).toContain('ORDER BY d.titulo ASC')
  })
})

describe('AcaoDetalheSchema', () => {
  it('aceita ações válidas e rejeita lixo', () => {
    expect(AcaoDetalheSchema.safeParse({ acao: 'mover', delta: -1 }).success).toBe(true)
    expect(AcaoDetalheSchema.safeParse({ acao: 'mover', delta: 2 }).success).toBe(false)
    expect(AcaoDetalheSchema.safeParse({ acao: 'clonar-regras', origemId: OUTRA }).success).toBe(true)
    expect(AcaoDetalheSchema.safeParse({ acao: 'trocar-docs', para: OUTRA, ids: [ID] }).success).toBe(true)
    expect(AcaoDetalheSchema.safeParse({ acao: 'remover-docs', ids: ['x'] }).success).toBe(false)
    expect(AcaoDetalheSchema.safeParse({ acao: 'apagar-tudo' }).success).toBe(false)
  })
})

describe('trocarOrdem', () => {
  const l = [{ id: 'a', ordem: 1 }, { id: 'b', ordem: 2 }, { id: 'c', ordem: 2 }]
  it('troca com o vizinho', () => { expect(trocarOrdem(l, 'b', -1)).toEqual([{ id: 'b', ordem: 1 }, { id: 'a', ordem: 2 }]) })
  it('empate empurra 1 passo', () => { expect(trocarOrdem(l, 'c', -1)).toEqual([{ id: 'c', ordem: 1 }]) })
  it('limites e id inexistente', () => { expect(trocarOrdem(l, 'a', -1)).toEqual([]); expect(trocarOrdem(l, 'c', 1)).toEqual([]); expect(trocarOrdem(l, 'z', 1)).toEqual([]) })
})

describe('planoClonarRegras', () => {
  const origem = { adaptativo: { tempo: { modo: 'fixo', minutos_fixo: 30 }, meta: { gera_meta: true } }, gerador: {} }
  const destino = { adaptativo: { tempo: { modo: 'por_pagina', min_por_pagina: 3 }, meta: {} } }
  it('preencher não sobrescreve o que o destino já define', () => {
    const r = planoClonarRegras(OUTRA, origem, destino, 'preencher')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ area: 'adaptativo', classificacaoId: OUTRA, patch: { tempo: { minutos_fixo: 30 }, meta: { gera_meta: true } } })
  })
  it('substituir iguala e zera o que só o destino tinha', () => {
    const r = planoClonarRegras(OUTRA, origem, destino, 'substituir')
    expect(r[0].patch).toEqual({ tempo: { modo: 'fixo', minutos_fixo: 30, min_por_pagina: null }, meta: { gera_meta: true } })
  })
  it('respeita areas e ignora origem vazia', () => {
    expect(planoClonarRegras(OUTRA, origem, destino, 'preencher', ['gerador'])).toEqual([])
  })
})

describe('diffResumo', () => {
  it('lista só o que mudou, achatando objetos', () => {
    const d = diffResumo({ nome: 'A', exibicao: { legenda: false, indice: { nivel_max: 3 } } }, { nome: 'A', exibicao: { legenda: true, indice: { nivel_max: 3 } }, cor: null })
    expect(d).toEqual([{ campo: 'exibicao.legenda', antes: 'false', depois: 'true' }, { campo: 'cor', antes: '—', depois: 'vazio' }])
  })
  it('trunca valores longos e limita a quantidade', () => {
    const d = diffResumo({}, { t: 'x'.repeat(200) })
    expect(d[0].depois.length).toBeLessThanOrEqual(80)
    const muitos = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`c${i}`, i]))
    expect(diffResumo({}, muitos, 5)).toHaveLength(5)
  })
  it('nulos e vazios não quebram', () => { expect(diffResumo(null, null)).toEqual([]) })
})
