import { describe, it, expect } from 'vitest'
import { decisaoImpersonation } from '../guard-rule'
import { rotaBloqueada, casaPadraoRota, BLOCKED_ROUTES } from '../blocked-routes'

// read_only (modo ainda suportado): bloqueia toda mutação.
describe('read_only', () => {
  it('permite GET', () => expect(decisaoImpersonation('read_only', 'GET', '/aluno').bloquear).toBe(false))
  it('bloqueia POST com motivo read_only_session', () => {
    const d = decisaoImpersonation('read_only', 'POST', '/aluno/leitura')
    expect(d.bloquear).toBe(true)
    expect(d.motivo).toBe('read_only_session')
  })
  it('permite HEAD/OPTIONS', () => {
    for (const m of ['HEAD', 'OPTIONS']) expect(decisaoImpersonation('read_only', m, '/aluno').bloquear).toBe(false)
  })
})

// read_and_act (modo OPERÁVEL, padrão): libera tudo, MENOS a blocklist (identidade/irreversível).
describe('read_and_act (operável)', () => {
  it('LIBERA responder simulado (grava como o aluno)', () =>
    expect(decisaoImpersonation('read_and_act', 'POST', '/api/aluno/sessao/resposta').bloquear).toBe(false))
  it('LIBERA gamificação/leitura/personalização', () => {
    expect(decisaoImpersonation('read_and_act', 'POST', '/api/aluno/gamificacao/ping').bloquear).toBe(false)
    expect(decisaoImpersonation('read_and_act', 'POST', '/api/aluno/perfil/personalizar').bloquear).toBe(false)
  })
  it('BLOQUEIA consentimento/solicitação LGPD', () => {
    const d = decisaoImpersonation('read_and_act', 'POST', '/lgpd/consentimento')
    expect(d.bloquear).toBe(true)
    expect(d.motivo).toBe('action_blocked_during_impersonation')
    expect(decisaoImpersonation('read_and_act', 'DELETE', '/api/aluno/lgpd/solicitacao').bloquear).toBe(true)
  })
  it('BLOQUEIA exclusão de conta e troca de e-mail de login', () => {
    expect(decisaoImpersonation('read_and_act', 'DELETE', '/api/aluno/conta').bloquear).toBe(true)
    expect(decisaoImpersonation('read_and_act', 'POST', '/api/aluno/perfil/email/trocar').bloquear).toBe(true)
  })
  it('PERMITE ver a página de LGPD (GET) — só a submissão é barrada', () =>
    expect(decisaoImpersonation('read_and_act', 'GET', '/lgpd/consentimento').bloquear).toBe(false))
})

describe('casaPadraoRota', () => {
  it("'*' casa tudo", () => expect(casaPadraoRota('*', '/qualquer/coisa')).toBe(true))
  it("sufixo '/*' casa base e prefixo", () => {
    expect(casaPadraoRota('/api/aluno/conta/*', '/api/aluno/conta')).toBe(true)
    expect(casaPadraoRota('/api/aluno/conta/*', '/api/aluno/conta/excluir')).toBe(true)
    expect(casaPadraoRota('/api/aluno/conta/*', '/api/aluno/outro')).toBe(false)
  })
  it('curinga por segmento', () => {
    expect(casaPadraoRota('/a/*/c', '/a/b/c')).toBe(true)
    expect(casaPadraoRota('/a/*/c', '/a/b/d')).toBe(false)
  })
})

describe('rotaBloqueada respeita o método', () => {
  it('GET em /lgpd/* NÃO casa a regra POST', () => expect(rotaBloqueada('GET', '/lgpd/consentimento')).toBeNull())
  it('POST em /lgpd/* casa', () => expect(rotaBloqueada('POST', '/lgpd/consentimento')).not.toBeNull())
})

// Contrato: a blocklist cobre os pontos de identidade/irreversível (e NADA de simulado).
describe('contrato da blocklist (operável)', () => {
  it('cobre LGPD + conta + e-mail de login', () => {
    const chaves = new Set(BLOCKED_ROUTES.map((r) => `${r.method} ${r.pathPattern}`))
    expect(chaves.has('POST /lgpd/*')).toBe(true)
    expect(chaves.has('* /api/aluno/lgpd/*')).toBe(true)
    expect(chaves.has('* /api/aluno/conta/*')).toBe(true)
  })
  it('NÃO bloqueia simulado/leitura (agora são operáveis)', () => {
    expect(rotaBloqueada('POST', '/aluno/simulado/123')).toBeNull()
    expect(rotaBloqueada('POST', '/api/aluno/sessao/resposta')).toBeNull()
  })
})
