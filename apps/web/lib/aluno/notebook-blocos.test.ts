import { describe, expect, it } from 'vitest'
import { anexarBloco, anexarEValidar, blocoCriarSchema, validarBloco } from './notebook-blocos'

const U = '11111111-1111-4111-8111-111111111111'
const OP = '22222222-2222-4222-8222-222222222222'
const grifo = { tipo: 'grifoSnapshot' as const, attrs: { documento_id: U, pagina: 2, texto: 'trecho grifado', cor: 'amarelo' } }

describe('validarBloco', () => {
  it('aceita grifo, questão e anotação válidos', () => {
    expect(validarBloco(grifo).ok).toBe(true)
    expect(validarBloco({ tipo: 'questaoRef', attrs: { questao_id: U } }).ok).toBe(true)
    expect(validarBloco({ tipo: 'anotacaoRef', attrs: { texto: 'oi' } }).ok).toBe(true)
  })
  it('rejeita attrs inválidos e descarta attrs desconhecidos', () => {
    expect(validarBloco({ tipo: 'questaoRef', attrs: { questao_id: 'nao-uuid' } }).ok).toBe(false)
    expect(validarBloco({ tipo: 'grifoSnapshot', attrs: { documento_id: U } }).ok).toBe(true) // pagina/documento_id são opcionais (notas importadas)
    expect(validarBloco({ tipo: 'grifoSnapshot', attrs: { documento_id: 'x', pagina: 1 } }).ok).toBe(false) // presente porém inválido
    const r = validarBloco({ tipo: 'questaoRef', attrs: { questao_id: U, extra: '<script>' } })
    expect(r.ok && r.no.attrs).toEqual({ questao_id: U })
  })
  it('link perigoso no grifo é descartado', () => {
    const r = validarBloco({ tipo: 'grifoSnapshot', attrs: { ...grifo.attrs, link: 'javascript:alert(1)' } })
    expect(r.ok && r.no.attrs.link).toBeUndefined()
  })
})

describe('anexarBloco', () => {
  const no = { type: 'questaoRef', attrs: { questao_id: U } }
  it('substitui doc vazio e termina com parágrafo vazio', () => {
    const d = anexarBloco({ type: 'doc', content: [{ type: 'paragraph' }] }, no)
    expect(d.content.map((n: any) => n.type)).toEqual(['questaoRef', 'paragraph'])
  })
  it('anexa ao fim preservando conteúdo; não muta a entrada', () => {
    const entrada = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'oi' }] }] }
    const copia = JSON.stringify(entrada)
    const d = anexarBloco(entrada, no)
    expect(d.content.map((n: any) => n.type)).toEqual(['paragraph', 'questaoRef', 'paragraph'])
    expect(JSON.stringify(entrada)).toBe(copia)
  })
  it('doc nulo vira doc só com o bloco', () => {
    expect(anexarBloco(null, no).content).toHaveLength(2)
  })
  it('anexarEValidar rejeita estouro de nós', () => {
    const grande = { type: 'doc', content: Array.from({ length: 4999 }, () => ({ type: 'paragraph' })) }
    expect(anexarEValidar(grande, no).ok).toBe(false)
    expect(anexarEValidar({ type: 'doc', content: [{ type: 'paragraph' }] }, no).ok).toBe(true)
  })
})

describe('blocoCriarSchema', () => {
  it('exige client_op_id e proíbe pagina_id junto de secao_id', () => {
    expect(blocoCriarSchema.safeParse({ client_op_id: OP, bloco: grifo }).success).toBe(true)
    expect(blocoCriarSchema.safeParse({ bloco: grifo }).success).toBe(false)
    expect(blocoCriarSchema.safeParse({ client_op_id: OP, bloco: grifo, pagina_id: U, secao_id: U }).success).toBe(false)
    expect(blocoCriarSchema.safeParse({ client_op_id: OP, bloco: { tipo: 'image', attrs: {} } }).success).toBe(false)
  })
})
