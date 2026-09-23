import { describe, it, expect } from 'vitest'
import { decisaoImpersonation } from '../guard-rule'
import { rotaBloqueada, casaPadraoRota, BLOCKED_ROUTES } from '../blocked-routes'

// 7.1 — read_only bloqueia toda mutação (o coração do MVP).
describe('read_only (MVP)', () => {
  it('permite GET', () => expect(decisaoImpersonation('read_only', 'GET', '/aluno').bloquear).toBe(false))
  it('bloqueia POST com motivo read_only_session', () => {
    const d = decisaoImpersonation('read_only', 'POST', '/aluno/leitura')
    expect(d.bloquear).toBe(true)
    expect(d.motivo).toBe('read_only_session')
  })
  it('bloqueia PUT/PATCH/DELETE', () => {
    for (const m of ['PUT', 'PATCH', 'DELETE']) expect(decisaoImpersonation('read_only', m, '/api/aluno/x').bloquear).toBe(true)
  })
  it('permite HEAD/OPTIONS (leitura/preflight)', () => {
    for (const m of ['HEAD', 'OPTIONS']) expect(decisaoImpersonation('read_only', m, '/aluno').bloquear).toBe(false)
  })
})

// 7.1 — read_and_act consulta a blocklist (rotas sensíveis).
describe('read_and_act (futuro) — blocklist', () => {
  it('bloqueia mutação em /api/aluno/*', () => {
    const d = decisaoImpersonation('read_and_act', 'POST', '/api/aluno/gamificacao/ping')
    expect(d.bloquear).toBe(true)
    expect(d.motivo).toBe('action_blocked_during_impersonation')
  })
  it('bloqueia submit de simulado (qualquer método)', () =>
    expect(decisaoImpersonation('read_and_act', 'POST', '/aluno/simulado/123').bloquear).toBe(true))
  it('permite GET fora da blocklist', () =>
    expect(decisaoImpersonation('read_and_act', 'GET', '/aluno/leitura').bloquear).toBe(false))
})

describe('casaPadraoRota', () => {
  it("'*' casa tudo", () => expect(casaPadraoRota('*', '/qualquer/coisa')).toBe(true))
  it("sufixo '/*' casa base e prefixo", () => {
    expect(casaPadraoRota('/aluno/simulado/*', '/aluno/simulado')).toBe(true)
    expect(casaPadraoRota('/aluno/simulado/*', '/aluno/simulado/1')).toBe(true)
    expect(casaPadraoRota('/aluno/simulado/*', '/aluno/outro')).toBe(false)
  })
  it('curinga por segmento', () => {
    expect(casaPadraoRota('/a/*/c', '/a/b/c')).toBe(true)
    expect(casaPadraoRota('/a/*/c', '/a/b/d')).toBe(false)
  })
})

describe('rotaBloqueada respeita o método', () => {
  it('GET em /api/aluno/* NÃO casa a regra POST', () => expect(rotaBloqueada('GET', '/api/aluno/x')).toBeNull())
  it('POST em /api/aluno/* casa', () => expect(rotaBloqueada('POST', '/api/aluno/x')).not.toBeNull())
})

// 7.2 (contrato) — a MESMA blocklist é a fonte de verdade em runtime; garante que os itens
// críticos estão presentes (front + middleware + seed do banco derivam desta lista).
describe('contrato da blocklist', () => {
  it('cobre as rotas perigosas essenciais', () => {
    const chaves = new Set(BLOCKED_ROUTES.map((r) => `${r.method} ${r.pathPattern}`))
    expect(chaves.has('POST /api/aluno/*')).toBe(true)
    expect(chaves.has('* /aluno/simulado/*')).toBe(true)
    expect(chaves.has('* /simulado/*')).toBe(true)
  })
})
