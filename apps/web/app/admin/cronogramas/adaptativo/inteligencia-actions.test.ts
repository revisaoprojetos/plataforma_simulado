import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
const perm = { cronogramas: new Set<string>(['view', 'update']) }
vi.mock('@/lib/auth/permissions', () => ({
  getCurrentAccess: async () => ({ tenantId: 't1', userId: 'u1' }),
  accessCan: (_a: unknown, p: string) => perm.cronogramas.has(p.split(':')[1]),
}))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/cronograma/adaptativo/config-regras', async () => {
  const { REGRAS_PADRAO } = await import('@/lib/cronograma/adaptativo/regras')
  return { lerRegistroRegras: async () => ({ versao: 3, regras: REGRAS_PADRAO, hash: 'h', delta: {} }) }
})
vi.mock('@/lib/cronograma/adaptativo/rastro-plano-server', () => ({ rastroDoAluno: async () => ({ ok: false, error: 'x' }) }))
const trava = { itens: [] as Array<{ planoId: string; impacto: unknown }>, parcial: false }
vi.mock('@/lib/cronograma/adaptativo/inteligencia-server', () => ({
  amostrarPlanos: async () => ({ ids: [], faixas: {}, pool: 0 }), carregarBaseSimulacao: async () => ({}), impactoDoPlano: async () => null,
  nomesEstudantes: async () => new Map(), rodarLab: async () => null, rodarAmostraTrava: async () => trava,
}))
const salvar = vi.fn(async (..._a: unknown[]) => ({ ok: true, dados: { versao: 4, hash: 'n' }, avisos: [] as string[] }))
vi.mock('./regras-actions', () => ({ salvarRegras: (...a: unknown[]) => salvar(...a) }))

import { exportarRegrasVigentes, impactoLote, laboratorioRastro, previewImportacao, salvarRegrasComTrava } from './inteligencia-actions'

const div = { deltaFimSemanas: 0, deltaFimDias: 0, movidas: 0, removidas: 0, adicionadas: 0, violacoesBase: 0, violacoesAlt: 0, concluidasDivergentes: 2, concluidasDivergentesBase: 0, exemplosDivergentes: [] }
beforeEach(() => { perm.cronogramas = new Set(['view', 'update']); salvar.mockClear(); trava.itens = []; trava.parcial = false })

describe('inteligencia-actions', () => {
  it('sem permissão: erro em todas', async () => {
    perm.cronogramas = new Set()
    expect((await impactoLote({})).error).toBe('Sem permissão.')
    expect((await laboratorioRastro({ email: 'a@b.c', jsonParcial: '{}' })).ok).toBe(false)
    expect((await exportarRegrasVigentes()).ok).toBe(false)
    expect((await previewImportacao('{}')).ok).toBe(false)
    expect((await salvarRegrasComTrava({}, 0)).ok).toBe(false)
    expect(salvar).not.toHaveBeenCalled()
    perm.cronogramas = new Set(['view'])
    expect((await exportarRegrasVigentes()).ok).toBe(true)
    expect((await impactoLote({})).ok).toBe(false)
    expect((await salvarRegrasComTrava({}, 0)).ok).toBe(false)
  })
  it('trava: sem risco salva; com divergência pede confirmação e NÃO salva; com confirmarRisco salva', async () => {
    const regras = { legproc: { metasDiaMax: 5 } }
    const r0 = await salvarRegrasComTrava(regras, 3, 'm')
    expect(r0).toMatchObject({ ok: true, versao: 4 })
    expect(salvar).toHaveBeenCalledTimes(1)
    salvar.mockClear(); trava.itens = [{ planoId: 'p1', impacto: div }]
    const r1 = await salvarRegrasComTrava(regras, 3, 'm', false)
    expect(r1).toMatchObject({ ok: false, exigeConfirmacao: true })
    expect(salvar).not.toHaveBeenCalled()
    const r2 = await salvarRegrasComTrava(regras, 3, 'm', true)
    expect(r2.ok).toBe(true)
    expect(salvar).toHaveBeenCalledTimes(1)
  })
  it('regras inválidas e chaves perigosas não chegam ao salvar', async () => {
    expect((await salvarRegrasComTrava({ limitesDia: { pdfDistintos: 99 } }, 3)).ok).toBe(false)
    expect((await salvarRegrasComTrava(JSON.parse('{"__proto__":{"a":1}}'), 3)).ok).toBe(false)
    expect(salvar).not.toHaveBeenCalled()
  })
  it('laboratório exige alteração', async () => {
    expect((await laboratorioRastro({ email: 'a@b.c' })).error).toMatch(/ao menos um campo/)
  })
})
