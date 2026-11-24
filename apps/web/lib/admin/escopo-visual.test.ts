import { describe, expect, it } from 'vitest'
import { adminUsaEscopoVisual } from './escopo-visual'

describe('adminUsaEscopoVisual', () => {
  it('aplica por padrão', () => {
    expect(adminUsaEscopoVisual('/admin')).toBe(true)
    expect(adminUsaEscopoVisual('/admin/estudantes/123')).toBe(true)
    expect(adminUsaEscopoVisual('/admin/revisao/cursos')).toBe(true)
  })
  it('respeita o opt-out por prefixo de segmento', () => {
    expect(adminUsaEscopoVisual('/admin/teste')).toBe(false)
    expect(adminUsaEscopoVisual('/admin/biblioteca/editar/abc')).toBe(false)
    expect(adminUsaEscopoVisual('/admin/biblioteca')).toBe(true)
    expect(adminUsaEscopoVisual('/admin/testes-x')).toBe(true)
  })
})
