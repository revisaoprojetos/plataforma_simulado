import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/cache/relatorio-cache', () => ({
  remember: async (_k: string, _t: number, f: () => Promise<unknown>) => f(),
  esquecer: async () => {},
}))
const audits: unknown[] = []
vi.mock('@/lib/audit', () => ({ registrarAudit: async (a: unknown) => { audits.push(a) } }))

import { lerRegistroRegras, lerRegrasMotor, salvarRegrasTenant, lerRegistroBruto, CHAVE_TEMA_REGRAS, MAX_HISTORICO_REGRAS } from '../config-regras'
import { REGRAS_PADRAO, hashRegras } from '../regras'
import { validarRegras } from '../regras-validacao'
import { simularRegrasPuro } from '../simular-regras'
import dados from '../catalogo-html.json'
import type { AulaAS, ItemLP, Cfg28 } from '../motor28'

/** Supabase falso: 1 linha de simulado_tenants; update com filtro por versão do jsonb (simula a checagem otimista). */
function fakeSvc(temaInicial: Record<string, unknown> = {}) {
  const estado = { tema: temaInicial as Record<string, unknown>, updates: 0 }
  const from = () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { tema: estado.tema }, error: null }) }) }),
    update: (v: { tema: Record<string, unknown> }) => {
      const filtros: Array<{ k: string; v: unknown }> = []
      const q: any = {
        eq: (k: string, val: unknown) => { filtros.push({ k, v: val }); return q },
        is: (k: string, val: unknown) => { filtros.push({ k, v: val === null ? '__ausente__' : val }); return q },
        select: async () => {
          const reg = (estado.tema[CHAVE_TEMA_REGRAS] ?? null) as { versao?: number } | null
          for (const f of filtros) {
            if (f.k.endsWith('->>versao') && String(reg?.versao) !== f.v) return { data: [], error: null }
            if (f.v === '__ausente__' && reg !== null) return { data: [], error: null }
          }
          estado.tema = v.tema; estado.updates++
          return { data: [{ id: 't1' }], error: null }
        },
      }
      return q
    },
  })
  return { svc: { from } as never, estado }
}

beforeEach(() => { audits.length = 0 })

describe('config-regras (persistência em tema jsonb, zero migração)', () => {
  it('sem registro = padrão, versão 0', async () => {
    const { svc } = fakeSvc({ marca: 'x' })
    const r = await lerRegistroRegras(svc, 't1')
    expect(r.versao).toBe(0)
    expect(r.regras).toEqual(REGRAS_PADRAO)
    expect(r.hash).toBe(hashRegras(REGRAS_PADRAO))
    expect(await lerRegrasMotor(svc, 't1')).toEqual(REGRAS_PADRAO)
  })
  it('salva, incrementa versão, guarda só o delta, preserva outras chaves do tema e audita', async () => {
    const { svc, estado } = fakeSvc({ marca: 'x', cronograma_adaptativo_cfg: { velPadrao: 20 } })
    const v = validarRegras({ limitesDia: { pdfDistintos: 1 } })
    expect(v.ok).toBe(true)
    const r = await salvarRegrasTenant(svc, 't1', v.regras, 0, 'user-1', 'teste')
    expect(r).toMatchObject({ ok: true, versao: 1 })
    expect(estado.tema.marca).toBe('x')
    expect(estado.tema.cronograma_adaptativo_cfg).toEqual({ velPadrao: 20 })
    const reg = estado.tema[CHAVE_TEMA_REGRAS] as { delta: unknown; versao: number; atualizadoPor: string }
    expect(reg.delta).toEqual({ limitesDia: { pdfDistintos: 1 } })
    expect(reg.atualizadoPor).toBe('user-1')
    expect((await lerRegistroRegras(svc, 't1')).regras.limitesDia.pdfDistintos).toBe(1)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ operacao: 'UPDATE', entidade: 'simulado_cronograma_adaptativo_regras', tenantId: 't1', atorId: 'user-1' })
  })
  it('checagem otimista: versão defasada → conflito, nada gravado', async () => {
    const { svc, estado } = fakeSvc()
    expect((await salvarRegrasTenant(svc, 't1', { limitesDia: { questoes: 1 } }, 0, 'a')).ok).toBe(true)
    const antes = estado.updates
    const r = await salvarRegrasTenant(svc, 't1', { limitesDia: { questoes: 2 } }, 0, 'b') // ainda acha que está na versão 0
    expect(r).toMatchObject({ ok: false, conflito: true })
    expect(estado.updates).toBe(antes)
    expect(audits).toHaveLength(1)
    expect((await salvarRegrasTenant(svc, 't1', { limitesDia: { questoes: 2 } }, 1, 'b')).ok).toBe(true)
  })
  it('histórico: últimas 20 versões, mais recente primeiro; restaurar o padrão zera o delta', async () => {
    const { svc, estado } = fakeSvc()
    for (let k = 0; k < 25; k++) {
      const r = await salvarRegrasTenant(svc, 't1', { equilibrio: { retornosDiaMax: (k % 6) + 1 } }, k, 'u')
      expect(r.ok).toBe(true)
    }
    const reg = lerRegistroBruto(estado.tema[CHAVE_TEMA_REGRAS])
    expect(reg.versao).toBe(25)
    expect(reg.historico).toHaveLength(MAX_HISTORICO_REGRAS)
    expect(reg.historico[0].versao).toBe(24)
    expect(reg.historico[MAX_HISTORICO_REGRAS - 1].versao).toBe(5)
    const rp = await salvarRegrasTenant(svc, 't1', REGRAS_PADRAO, 25, 'u', 'Restaurado o padrão')
    expect(rp.ok).toBe(true)
    expect(lerRegistroBruto(estado.tema[CHAVE_TEMA_REGRAS]).delta).toEqual({})
    expect((await lerRegistroRegras(svc, 't1')).regras).toEqual(REGRAS_PADRAO)
  })
  it('lixo no jsonb não quebra (cai no padrão)', async () => {
    const { svc } = fakeSvc({ [CHAVE_TEMA_REGRAS]: { versao: 'x', delta: [1, 2], historico: 'oops' } })
    const r = await lerRegistroRegras(svc, 't1')
    expect(r.versao).toBe(0)
    expect(r.regras).toEqual(REGRAS_PADRAO)
  })
})

describe('simularRegrasPuro (motor da action simularRegras): diff proposto × vigente', () => {
  const CAT = dados as unknown as { aulas: Array<string[] | null>; ordem: number[]; ordemLP: number[]; legprocs: Array<{ disc: string; lei?: string; texto?: string }> }
  const AS = CAT.aulas.map((a) => (a ? [...a] : ['', '', '', 0, '', ''])) as unknown as AulaAS[]
  const LP = CAT.ordemLP.map((i) => ({ id: 'lp:1:' + i, disc: CAT.legprocs[i].disc, lei: CAT.legprocs[i].lei || '', texto: CAT.legprocs[i].texto || '' })) as unknown as ItemLP[]
  const cfg = { start: '2026-01-05', horas: [4, 4, 4, 4, 4, 0, 0], discs: ['Direito Administrativo', 'Direito Constitucional', 'Direito Civil', 'Direito Tributário'], metas: { pf: true, fl: true, qu: true, lp: true }, arranjo: 'pdf', revisao: { ativa: true, cada: 8 } } as unknown as Cfg28

  it('regras iguais → diff nulo', () => {
    const d = simularRegrasPuro(cfg, { AS, LP, ordem: CAT.ordem }, {}, {}, '2026-01-05')
    expect(d.deltaFimSemanas).toBe(0)
    expect(d.deltaMetas).toBe(0)
    expect(d.idsComDataDiferente + d.idsApenasProposto + d.idsApenasVigente).toBe(0)
    expect(d.vigente.totalMetas).toBeGreaterThan(100)
    expect(d.vigente.primeiraData).toBe('2026-01-05')
    expect(d.vigente.erro).toBeUndefined()
  })
  it('teto de PDFull da faixa 2 de 4 para 2 → muda o plano (datas e/ou fim)', () => {
    const d = simularRegrasPuro(cfg, { AS, LP, ordem: CAT.ordem }, { tetosPdf: [{}, { teto: 2 }, {}, {}] }, {}, '2026-01-05')
    expect(d.idsComDataDiferente + d.idsApenasProposto + d.idsApenasVigente).toBeGreaterThan(0)
    expect(d.deltaFimSemanas).toBeGreaterThanOrEqual(0)
    expect(Object.keys(d.vigente.metasPorTipo)).toEqual(expect.arrayContaining(['pf', 'fl', 'qu', 'lp']))
  })
  it('horizonte curto → o erro do motor volta no resumo (não derruba a simulação)', () => {
    const d = simularRegrasPuro(cfg, { AS, LP, ordem: CAT.ordem }, { horizonte: { maxSemanas: 20 } }, {}, '2026-01-05')
    expect(d.proposto.erro).toMatch(/semanas/)
    expect(d.vigente.erro).toBeUndefined()
  })
  it('gx: sem gx no conteúdo, regra de tipo personalizado dá diff zero; com gx, "ativo:false" remove as metas gx', () => {
    const GX = Array.from({ length: 12 }, (_, k) => ({ id: `gx:comentarios:${String(k).padStart(8, '0')}`, slug: 'comentarios', nomeTipo: 'Comentários', disc: 'Direito Administrativo', titulo: `Doc ${k}`, doc: null, min: 20, prioridade: 5, ordem: k }))
    const regra = { tiposGx: { comentarios: { ativo: false } } }
    const sem = simularRegrasPuro(cfg, { AS, LP, ordem: CAT.ordem }, regra, {}, '2026-01-05')
    expect(sem.idsComDataDiferente + sem.idsApenasProposto + sem.idsApenasVigente).toBe(0)
    const com = simularRegrasPuro(cfg, { AS, LP, ordem: CAT.ordem, gx: GX }, regra, {}, '2026-01-05')
    expect(com.vigente.metasPorTipo.gx ?? 0).toBeGreaterThan(0)
    expect(com.proposto.metasPorTipo.gx ?? 0).toBe(0)
    expect(com.deltaPorTipo.gx).toBeLessThan(0)
  })
})
