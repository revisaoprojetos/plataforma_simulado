// Cache em memória do gate do Caderno (beta): TTL 30 s (decisão) / 60 s (grupos do tenant), positivo e negativo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const h = vi.hoisted(() => ({ lerGrupos: 0, grupos: ['g1'] as string[], erroGrupos: false, emGrupo: new Set<string>(), workspace: new Set<string>(), chamadasGrupo: 0, chamadasWs: 0 }))
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
      h.lerGrupos++
      return h.erroGrupos ? { data: null, error: { code: 'XX', message: 'falha' } } : { data: { g: h.grupos }, error: null }
    } }) }) }),
  }),
}))
vi.mock('@/lib/sistema/testadores-globais', () => ({
  normalizarIdsWorkspace: (v: unknown) => (Array.isArray(v) ? v : []),
  estudanteEmAlgumGrupo: async (e: string) => { h.chamadasGrupo++; return h.emGrupo.has(e) },
  ehNoWorkspace: async ({ estudanteId }: { estudanteId: string }) => { h.chamadasWs++; return h.workspace.has(estudanteId) },
}))

import { cadernoBetaLiberado, limparCacheCadernoBeta, TTL_BETA_MS } from './caderno-beta-acesso'

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-23T12:00:00Z'))
  limparCacheCadernoBeta()
  Object.assign(h, { lerGrupos: 0, grupos: ['g1'], erroGrupos: false, emGrupo: new Set(), workspace: new Set(), chamadasGrupo: 0, chamadasWs: 0 })
})
afterEach(() => vi.useRealTimers())

describe('cadernoBetaLiberado — cache com TTL', () => {
  it('resultado POSITIVO é cacheado por 30 s e recalculado depois', async () => {
    h.emGrupo.add('e1')
    expect(await cadernoBetaLiberado({ tenantId: 't', estudanteId: 'e1' })).toBe(true)
    h.emGrupo.delete('e1') // removido do beta: só vale após o TTL
    expect(await cadernoBetaLiberado({ tenantId: 't', estudanteId: 'e1' })).toBe(true)
    expect(h.chamadasGrupo).toBe(1)
    vi.advanceTimersByTime(TTL_BETA_MS + 1)
    expect(await cadernoBetaLiberado({ tenantId: 't', estudanteId: 'e1' })).toBe(false)
    expect(h.chamadasGrupo).toBe(2)
  })

  it('resultado NEGATIVO também é cacheado (e liberar passa a valer após o TTL)', async () => {
    expect(await cadernoBetaLiberado({ tenantId: 't', estudanteId: 'e2' })).toBe(false)
    h.workspace.add('e2')
    expect(await cadernoBetaLiberado({ tenantId: 't', estudanteId: 'e2' })).toBe(false)
    expect(h.chamadasWs).toBe(1)
    vi.advanceTimersByTime(TTL_BETA_MS + 1)
    expect(await cadernoBetaLiberado({ tenantId: 't', estudanteId: 'e2' })).toBe(true)
  })

  it('chave por tenant+estudante; grupos do tenant lidos 1x dentro de 60 s para vários alunos', async () => {
    await cadernoBetaLiberado({ tenantId: 't', estudanteId: 'a' })
    await cadernoBetaLiberado({ tenantId: 't', estudanteId: 'b' })
    await cadernoBetaLiberado({ tenantId: 't2', estudanteId: 'a' })
    expect(h.lerGrupos).toBe(2) // t e t2
    vi.advanceTimersByTime(TTL_BETA_MS + 1)
    await cadernoBetaLiberado({ tenantId: 't', estudanteId: 'a' })
    expect(h.lerGrupos).toBe(2) // grupos ainda dentro dos 60 s
    vi.advanceTimersByTime(31_000)
    await cadernoBetaLiberado({ tenantId: 't', estudanteId: 'b' })
    expect(h.lerGrupos).toBe(3)
  })

  it('sem estudante => false sem consultar; falha ao ler grupos NÃO cacheia o "não"', async () => {
    expect(await cadernoBetaLiberado({ tenantId: 't', estudanteId: null })).toBe(false)
    expect(h.lerGrupos).toBe(0)
    h.erroGrupos = true
    expect(await cadernoBetaLiberado({ tenantId: 't', estudanteId: 'e3' })).toBe(false)
    h.erroGrupos = false; h.emGrupo.add('e3')
    expect(await cadernoBetaLiberado({ tenantId: 't', estudanteId: 'e3' })).toBe(true) // não ficou "grudado" em false
  })
})
