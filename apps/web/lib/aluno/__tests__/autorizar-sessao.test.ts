import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const h = vi.hoisted(() => ({
  aluno: null as any, access: null as any, hostTenant: null as string | null,
}))
vi.mock('@/lib/aluno-session', () => ({ getSessaoAluno: async () => h.aluno }))
vi.mock('@/lib/auth/permissions', () => ({ getCurrentAccess: async () => h.access }))
vi.mock('@/lib/tenant', () => ({ getCurrentTenantId: async () => h.hostTenant }))

import { autorizarSessao } from '../autorizar-sessao'
import { assinarSat } from '../sat'
import { assinarRenderToken } from '@/lib/pdf/render-token'

const SESS = { id: 'aaaaaaaa-1111', tenant_id: 'T1', estudante_id: 'E1' }
const acc = (o: any) => ({ userId: 'u1', tenantId: 'T1', role: 'x', isAdmin: false, permissions: [], ...o })

beforeEach(() => {
  process.env.PDF_RENDER_SECRET = 'r-secret'
  Object.assign(h, { aluno: null, access: acc({ userId: null, tenantId: null }), hostTenant: null })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('autorizarSessao', () => {
  it('dono (cookie, mesmo tenant e estudante) → dono', async () => {
    h.aluno = { tenantId: 'T1', estudanteId: 'E1' }
    expect(await autorizarSessao(SESS)).toEqual({ ok: true, via: 'dono' })
  })
  it('outro aluno do mesmo tenant → nega, sem fallback (mesmo com sat/host válidos)', async () => {
    h.aluno = { tenantId: 'T1', estudanteId: 'E2' }
    h.hostTenant = 'T1'
    expect((await autorizarSessao(SESS, { sat: assinarSat(SESS.id, 'T1') })).ok).toBe(false)
  })
  it('aluno de outro tenant → nega', async () => {
    h.aluno = { tenantId: 'T2', estudanteId: 'E1' }
    expect((await autorizarSessao(SESS)).ok).toBe(false)
  })
  it('impersonation: cookie do aluno visualizado → dono; outro aluno → nega', async () => {
    h.aluno = { tenantId: 'T1', estudanteId: 'E1', impersonation: { por: 'a', sessaoId: 's', actionLevel: 'read_only' } }
    expect((await autorizarSessao(SESS)).ok).toBe(true)
    h.aluno = { tenantId: 'T1', estudanteId: 'E9', impersonation: { por: 'a', sessaoId: 's', actionLevel: 'read_only' } }
    expect((await autorizarSessao(SESS)).ok).toBe(false)
  })
  it('admin do tenant com estudantes:view / relatorios:view / resultados:* → admin', async () => {
    for (const p of ['estudantes:view', 'relatorios:view', 'resultados:view', 'resultados:manage']) {
      h.access = acc({ permissions: [p] })
      expect(await autorizarSessao(SESS)).toEqual({ ok: true, via: 'admin' })
    }
  })
  it('isAdmin/super passa; questoes:view sozinho NÃO libera', async () => {
    h.access = acc({ isAdmin: true })
    expect((await autorizarSessao(SESS)).ok).toBe(true)
    h.access = acc({ permissions: ['questoes:view'] })
    expect((await autorizarSessao(SESS)).ok).toBe(false)
  })
  it('admin de OUTRO tenant → nega', async () => {
    h.access = acc({ isAdmin: true, tenantId: 'T2' })
    expect((await autorizarSessao(SESS)).ok).toBe(false)
  })
  it('sat válido → token', async () => {
    expect(await autorizarSessao(SESS, { sat: assinarSat(SESS.id, 'T1') })).toEqual({ ok: true, via: 'token' })
  })
  it('sat de OUTRA sessão / outro tenant / adulterado / expirado → nega (sem cair na transição)', async () => {
    h.hostTenant = 'T1'
    expect((await autorizarSessao(SESS, { sat: assinarSat('outra', 'T1') })).ok).toBe(false)
    expect((await autorizarSessao(SESS, { sat: assinarSat(SESS.id, 'T2') })).ok).toBe(false)
    expect((await autorizarSessao(SESS, { sat: assinarSat(SESS.id, 'T1') + 'x' })).ok).toBe(false)
    expect((await autorizarSessao(SESS, { sat: assinarSat(SESS.id, 'T1', -1) })).ok).toBe(false)
  })
  it('render-token da sessão+caderno → render; de outra sessão / outro caderno / sem s / outro tenant → nega', async () => {
    const mk = (o: any) => assinarRenderToken({ t: 'T1', r: 'caderno-teste', id: 'C1', ...o })
    expect(await autorizarSessao(SESS, { renderToken: mk({ s: SESS.id }), cadernoId: 'C1' })).toEqual({ ok: true, via: 'render' })
    expect((await autorizarSessao(SESS, { renderToken: mk({ s: 'outra' }), cadernoId: 'C1' })).ok).toBe(false)
    expect((await autorizarSessao(SESS, { renderToken: mk({ s: SESS.id }), cadernoId: 'C2' })).ok).toBe(false)
    expect((await autorizarSessao(SESS, { renderToken: mk({}), cadernoId: 'C1' })).ok).toBe(false)
    expect((await autorizarSessao(SESS, { renderToken: mk({ t: 'T2', s: SESS.id }), cadernoId: 'C1' })).ok).toBe(false)
  })
  it('sem credencial e host de outro tenant/nulo → nega', async () => {
    expect((await autorizarSessao(SESS)).ok).toBe(false)
    h.hostTenant = 'T2'
    expect((await autorizarSessao(SESS)).ok).toBe(false)
  })
  it('tenant da sessão nulo → nega (falha fechada)', async () => {
    h.aluno = { tenantId: 'T1', estudanteId: 'E1' }
    expect((await autorizarSessao({ id: 's', tenant_id: null, estudante_id: 'E1' })).ok).toBe(false)
    expect((await autorizarSessao({ id: 's', tenant_id: undefined, estudante_id: 'E1' })).ok).toBe(false)
  })
  it('transição: sem cookie/sat e host do mesmo tenant → host_transicao + log estruturado', async () => {
    h.hostTenant = 'T1'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await autorizarSessao(SESS, { rota: 'x' })).toEqual({ ok: true, via: 'host_transicao' })
    const log = JSON.parse(String(warn.mock.calls[0][0]))
    expect(log).toEqual({ evento: 'sessao_pdf_sem_sat', rota: 'x', tenant: 'T1', sessao: 'aaaaaaaa' })
  })
  it('exigirDados desliga a transição', async () => {
    h.hostTenant = 'T1'
    expect((await autorizarSessao(SESS, { exigirDados: true })).ok).toBe(false)
  })
})
