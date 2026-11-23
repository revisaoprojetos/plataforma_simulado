import { describe, it, expect, vi, beforeEach } from 'vitest'
import dados from '@/lib/cronograma/adaptativo/catalogo-html.json'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/cache/relatorio-cache', () => ({ remember: async (_k: string, _t: number, f: () => Promise<unknown>) => f(), esquecer: async () => {} }))
vi.mock('@/lib/audit', () => ({ registrarAudit: async () => {} }))

const perm = { cronogramas: new Set<string>(['view', 'update']) }
vi.mock('@/lib/auth/permissions', () => ({
  getCurrentAccess: async () => ({ tenantId: 't1', userId: 'u1' }),
  accessCan: (_a: unknown, p: string) => perm.cronogramas.has(p.split(':')[1]),
}))

const CAT = dados as unknown as { aulas: Array<string[] | null>; ordem: number[]; ordemLP: number[]; legprocs: Array<{ disc: string; lei?: string; texto?: string }> }
vi.mock('@/lib/cronograma/adaptativo/conteudo-banco', () => ({
  carregarConteudoBanco: async () => ({
    AS: CAT.aulas.map((a) => (a ? [...a] : ['', '', '', 0, '', ''])), ordem: CAT.ordem,
    LP: CAT.ordemLP.map((i) => ({ id: 'lp:1:' + i, disc: CAT.legprocs[i].disc, lei: CAT.legprocs[i].lei || '', texto: CAT.legprocs[i].texto || '' })),
  }),
}))
vi.mock('@/lib/cronograma/adaptativo/config-metas', () => ({ lerParamsMotor: async () => ({}) }))

let tema: Record<string, unknown> = {}
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { tema }, error: null }) }) }),
      update: (v: { tema: Record<string, unknown> }) => {
        const f: Array<[string, unknown]> = []
        const q: any = {
          eq: (k: string, x: unknown) => { f.push([k, x]); return q },
          is: (k: string, x: unknown) => { f.push([k, x === null ? '__ausente__' : x]); return q },
          select: async () => {
            const reg = (tema.cronograma_adaptativo_regras ?? null) as { versao?: number } | null
            for (const [k, x] of f) {
              if (k.endsWith('->>versao') && String(reg?.versao) !== x) return { data: [], error: null }
              if (x === '__ausente__' && reg !== null) return { data: [], error: null }
            }
            tema = v.tema
            return { data: [{ id: 't1' }], error: null }
          },
        }
        return q
      },
    }),
  }),
}))

import { obterRegras, salvarRegras, restaurarPadrao, listarVersoes, simularRegras } from './regras-actions'

const cfgExemplo = { start: '2026-01-05', horas: [4, 4, 4, 4, 4, 0, 0], discs: ['Direito Administrativo', 'Direito Constitucional', 'Direito Civil', 'Direito Tributário'], metas: { pf: true, fl: true, qu: true, lp: true } }

beforeEach(() => { tema = {}; perm.cronogramas = new Set(['view', 'update']) })

describe('server actions das regras do motor', () => {
  it('obterRegras: sem registro = padrão, versão 0', async () => {
    const r = await obterRegras()
    expect(r.ok).toBe(true)
    expect(r.dados).toMatchObject({ versao: 0, ehPadrao: true })
  })
  it('salvarRegras valida, grava e a leitura seguinte reflete; versão defasada = conflito', async () => {
    const ruim = await salvarRegras({ limitesDia: { pdfDistintos: 99 } }, 0)
    expect(ruim.ok).toBe(false)
    expect(ruim.erros?.join(' ')).toMatch(/máximo 6/)
    const ok = await salvarRegras({ limitesDia: { pdfDistintos: 1 } }, 0, 'teste')
    expect(ok).toMatchObject({ ok: true, dados: { versao: 1 } })
    const lido = await obterRegras()
    expect(lido.dados?.regras.limitesDia.pdfDistintos).toBe(1)
    expect(lido.dados?.ehPadrao).toBe(false)
    const conflito = await salvarRegras({ limitesDia: { pdfDistintos: 2 } }, 0)
    expect(conflito).toMatchObject({ ok: false, conflito: true })
  })
  it('restaurarPadrao + listarVersoes (atual + histórico)', async () => {
    await salvarRegras({ limitesDia: { questoes: 1 } }, 0)
    const rp = await restaurarPadrao(1)
    expect(rp).toMatchObject({ ok: true, dados: { versao: 2 } })
    expect((await obterRegras()).dados?.ehPadrao).toBe(true)
    const v = await listarVersoes()
    expect(v.dados?.map((x) => x.versao)).toEqual([2, 1])
    expect(v.dados?.[1].delta).toEqual({ limitesDia: { questoes: 1 } })
  })
  it('sem permissão: nada executa', async () => {
    perm.cronogramas = new Set()
    expect((await obterRegras()).ok).toBe(false)
    expect((await salvarRegras({}, 0)).error).toBe('Sem permissão.')
    expect((await restaurarPadrao(0)).ok).toBe(false)
    expect((await simularRegras({}, cfgExemplo as never)).ok).toBe(false)
    perm.cronogramas = new Set(['view'])
    expect((await obterRegras()).ok).toBe(true)
    expect((await salvarRegras({}, 0)).ok).toBe(false)
  })
  it('simularRegras: diff proposto × vigente; não grava', async () => {
    const r = await simularRegras({ tetosPdf: [{}, { teto: 2 }, {}, {}] }, cfgExemplo as never)
    expect(r.ok).toBe(true)
    expect(r.dados!.vigente.totalMetas).toBeGreaterThan(100)
    expect(r.dados!.idsComDataDiferente + r.dados!.idsApenasProposto + r.dados!.idsApenasVigente).toBeGreaterThan(0)
    expect((await obterRegras()).dados?.versao).toBe(0)
  })
  it('simularRegras rejeita regras inválidas e cfg incompleta', async () => {
    expect((await simularRegras({ horizonte: { maxSemanas: 5 } }, cfgExemplo as never)).ok).toBe(false)
    const r = await simularRegras({}, { start: 'x' } as never)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Informe/)
  })
})
