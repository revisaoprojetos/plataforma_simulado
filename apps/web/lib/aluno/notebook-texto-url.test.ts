import { describe, expect, it } from 'vitest'
import { linkSeguro, urlOk } from './notebook-texto'

describe('urlOk / linkSeguro (validador único de URL)', () => {
  it('aceita https/http/mailto/relativo /aluno', () => {
    for (const u of ['https://a.com/x', 'http://a.com', 'mailto:a@b.com', '/aluno/nova/inicio']) expect(urlOk(u)).toBe(true)
  })
  it('rejeita javascript:, data:, espaço, sem esquema e vazio', () => {
    for (const u of ['javascript:alert(1)', 'data:text/html,x', 'https://a b.com', 'a.com', '', '  ']) expect(urlOk(u)).toBe(false)
  })
  it('linkSeguro: devolve o href ou null', () => {
    expect(linkSeguro(' https://a.com ')).toBe('https://a.com')
    expect(linkSeguro('/aluno/x')).toBe('/aluno/x')
    expect(linkSeguro('javascript:1')).toBeNull()
    expect(linkSeguro(5)).toBeNull()
  })
})
