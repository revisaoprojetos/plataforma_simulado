import { describe, it, expect } from 'vitest'
import { planejarPromocaoEmail } from './promocao-email'

describe('planejarPromocaoEmail', () => {
  it('nada mudou: e-mail já é o principal (normalizado)', () => {
    expect(planejarPromocaoEmail({ email: 'A@x.com ', emails_secundarios: [] }, ['a@x.com'])).toEqual({ acao: 'pular', motivo: 'ja_principal' })
  })
  it('e-mail novo já está em secundários: não promove', () => {
    expect(planejarPromocaoEmail({ email: 'a@x.com', emails_secundarios: ['B@x.com'] }, ['b@x.com'])).toEqual({ acao: 'pular', motivo: 'ja_secundario' })
  })
  it('promove e move o antigo para secundários', () => {
    expect(planejarPromocaoEmail({ email: 'a@x.com', emails_secundarios: ['z@x.com'] }, ['b@x.com']))
      .toEqual({ acao: 'promover', email: 'b@x.com', secundarios: ['z@x.com', 'a@x.com'] })
  })
  it('múltiplos membros -> mesmo estudante, principal atual é um deles: mantém (sem ping-pong)', () => {
    expect(planejarPromocaoEmail({ email: 'a@x.com', emails_secundarios: [] }, ['a@x.com', 'b@x.com'])).toEqual({ acao: 'pular', motivo: 'ja_principal' })
    expect(planejarPromocaoEmail({ email: 'b@x.com', emails_secundarios: [] }, ['a@x.com', 'b@x.com'])).toEqual({ acao: 'pular', motivo: 'ja_principal' })
  })
  it('ping-pong A/B: depois de promover, a rodada seguinte é estável', () => {
    const r1 = planejarPromocaoEmail({ email: 'c@x.com', emails_secundarios: [] }, ['b@x.com', 'a@x.com'])
    expect(r1).toEqual({ acao: 'promover', email: 'a@x.com', secundarios: ['c@x.com'] })
    if (r1.acao !== 'promover') throw new Error()
    const r2 = planejarPromocaoEmail({ email: r1.email, emails_secundarios: r1.secundarios }, ['a@x.com', 'b@x.com'])
    expect(r2.acao).toBe('pular')
    const r3 = planejarPromocaoEmail({ email: r1.email, emails_secundarios: r1.secundarios }, ['b@x.com', 'a@x.com'])
    expect(r3.acao).toBe('pular')
  })
  it('escolha determinística independe da ordem', () => {
    const a = planejarPromocaoEmail({ email: 'c@x.com' }, ['b@x.com', 'a@x.com'])
    const b = planejarPromocaoEmail({ email: 'c@x.com' }, ['a@x.com', 'b@x.com'])
    expect(a).toEqual(b)
  })
  it('sem e-mails de membro', () => {
    expect(planejarPromocaoEmail({ email: 'a@x.com' }, ['', '  '])).toEqual({ acao: 'pular', motivo: 'sem_candidato' })
  })
})
