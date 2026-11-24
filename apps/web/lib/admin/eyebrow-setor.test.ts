import { describe, expect, it } from 'vitest'
import { eyebrowDoSetor } from './eyebrow-setor'

describe('eyebrowDoSetor', () => {
  it('deriva o setor da sidebar pela rota', () => {
    expect(eyebrowDoSetor('/admin/estudantes')).toBe('Alunos')
    expect(eyebrowDoSetor('/admin/estudantes/abc-123')).toBe('Alunos')
    expect(eyebrowDoSetor('/admin/relatorios/ranking')).toBe('Análise')
    expect(eyebrowDoSetor('/admin/lgpd')).toBe('Admin')
    expect(eyebrowDoSetor('/admin/sistema')).toBe('Super Admin')
    expect(eyebrowDoSetor('/admin/conteudos/produtos')).toBe('Pedagógico')
  })
  it('casa itens com query pelo path', () => {
    expect(eyebrowDoSetor('/admin/atendimento')).toBe('Atendimento')
    expect(eyebrowDoSetor('/admin/auditoria')).toBe('Admin')
  })
  it('override vence; rota sem setor ou vazia = undefined', () => {
    expect(eyebrowDoSetor('/admin/estudantes', 'Conteúdos')).toBe('Conteúdos')
    expect(eyebrowDoSetor('/admin/estudantes', '  ')).toBe('Alunos')
    expect(eyebrowDoSetor('/rota/inexistente')).toBeUndefined()
    expect(eyebrowDoSetor(null)).toBeUndefined()
  })
})
