import { describe, it, expect } from 'vitest'
import { emailSeguro, filtroEmailOr, sanearBusca } from '../email-seguro'

describe('emailSeguro', () => {
  it('normaliza e aceita e-mail valido', () => {
    expect(emailSeguro('  Joao_Silva+x@Exemplo.com.br ')).toBe('joao_silva+x@exemplo.com.br')
  })
  it.each([
    'x,id.not.is.null',
    'a@b.com,id.not.is.null',
    'a@b.com)',
    'a@b.com*',
    'a%@b.com',
    'a b@c.com',
    'a"@b.com',
    'a\\@b.com',
    'a{b}@c.com',
    'semarroba',
    '',
  ])('rejeita %s', (v) => expect(emailSeguro(v)).toBeNull())
  it('rejeita nao-string', () => expect(emailSeguro(123)).toBeNull())
})

describe('filtroEmailOr', () => {
  it('escapa _ no ilike', () => {
    expect(filtroEmailOr('a_b@c.com')).toBe('email.ilike.a\\_b@c.com,emails_secundarios.cs.{a_b@c.com}')
  })
})

describe('sanearBusca', () => {
  it('remove metacaracteres de filtro', () => {
    expect(sanearBusca('x,id.not.is.null)')).not.toMatch(/[,()]/)
    expect(sanearBusca('a%b*c')).toBe('a b c')
  })
})
