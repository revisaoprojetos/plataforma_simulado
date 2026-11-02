import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'

// Consulta de membros de um grupo (server-only), compartilhada pela server action da lista
// (paginada) e pela rota de export XLSX. Filtros aplicados NO BANCO sempre que possível.

export type MembroLinha = {
  id: string
  nome: string
  email: string | null
  classificacao: string | null
  expiraEm: string | null
  entrouEm: string | null
}

export type FiltrosMembros = {
  q: string
  situacao: '' | 'vitalicio' | 'ativo' | 'expirado'
  entrou: '' | '7' | '30' | '90'
  sort: 'nome' | 'entrou' | 'situacao'
  dir: 'asc' | 'desc'
  page: number
  pp: number
}

export function normalizarFiltros(raw: Record<string, unknown>): FiltrosMembros {
  const s = (v: unknown) => (typeof v === 'string' ? v : '')
  const situacao = s(raw.situacao)
  const entrou = s(raw.entrou)
  const sort = s(raw.sort)
  const pp = Number(raw.pp)
  return {
    q: s(raw.q).trim().slice(0, 120),
    situacao: situacao === 'vitalicio' || situacao === 'ativo' || situacao === 'expirado' ? situacao : '',
    entrou: entrou === '7' || entrou === '30' || entrou === '90' ? entrou : '',
    sort: sort === 'entrou' || sort === 'situacao' ? sort : 'nome',
    dir: s(raw.dir) === 'desc' ? 'desc' : 'asc',
    page: Math.max(1, Number(raw.page) || 1),
    pp: [5, 10, 25, 50].includes(pp) ? pp : 10,
  }
}

const COL_ERR = /column|does not exist|expira_em|criado_em|schema cache/i

/**
 * @param todos true = sem paginação (export). `ids` restringe a estes estudantes (export da seleção).
 */
export async function consultarMembros(
  tenantId: string, grupoId: string, f: FiltrosMembros, opts: { todos?: boolean; ids?: string[] } = {},
): Promise<{ rows: MembroLinha[]; total: number }> {
  const svc = createAdminClient()
  const agora = new Date().toISOString()
  const corte = f.entrou ? new Date(Date.now() - Number(f.entrou) * 86400000).toISOString() : null

  // Constrói a consulta de vínculos com os filtros do banco (situação/entrou/ids).
  const base = (cols: string, comValidade: boolean, comData: boolean, count = false) => {
    let q: any = svc.from('simulado_grupo_membros').select(cols, count ? { count: 'exact' } : undefined)
      .eq('grupo_id', grupoId).eq('tenant_id', tenantId)
    if (opts.ids?.length) q = q.in('estudante_id', opts.ids)
    if (comValidade) {
      if (f.situacao === 'vitalicio') q = q.is('expira_em', null)
      else if (f.situacao === 'ativo') q = q.gt('expira_em', agora)
      else if (f.situacao === 'expirado') q = q.lte('expira_em', agora)
    }
    if (comData && corte) q = q.gte('criado_em', corte)
    return q
  }
  const variantes: { cols: string; v: boolean; d: boolean }[] = [
    { cols: 'estudante_id, expira_em, criado_em', v: true, d: true },
    { cols: 'estudante_id, criado_em', v: false, d: true },
    { cols: 'estudante_id', v: false, d: false },
  ]

  const porNomeOuBusca = f.sort === 'nome' || !!f.q
  const paginar = !opts.todos

  for (const va of variantes) {
    try {
      let vinc: any[] = []
      let totalDb = 0
      if (!porNomeOuBusca && paginar) {
        const ordemCol = f.sort === 'entrou' ? (va.d ? 'criado_em' : 'estudante_id') : (va.v ? 'expira_em' : 'estudante_id')
        const from = (f.page - 1) * f.pp
        const r = await base(va.cols, va.v, va.d, true)
          .order(ordemCol, { ascending: f.dir === 'asc', nullsFirst: false }).order('estudante_id', { ascending: true })
          .range(from, from + f.pp - 1)
        if (r.error) throw r.error
        vinc = r.data ?? []; totalDb = r.count ?? 0
      } else {
        vinc = await fetchAll<any>(() => base(va.cols, va.v, va.d).order('estudante_id', { ascending: true }))
        totalDb = vinc.length
      }

      const ids = [...new Set(vinc.map((v) => v.estudante_id).filter(Boolean))] as string[]
      const ests = ids.length
        ? await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_estudantes').select('id, nome, email, classificacao').in('id', chunk).eq('tenant_id', tenantId).order('id', { ascending: true }), { chunk: 300 })
        : []
      const porId = new Map<string, any>(ests.map((e) => [e.id, e]))
      let rows: MembroLinha[] = vinc.map((v) => {
        const e = porId.get(v.estudante_id)
        return {
          id: v.estudante_id, nome: e?.nome ?? 'Estudante', email: e?.email ?? null, classificacao: e?.classificacao ?? null,
          expiraEm: v.expira_em ?? null, entrouEm: v.criado_em ?? null,
        }
      })

      if (!porNomeOuBusca && paginar) return { rows, total: totalDb }

      if (f.q) {
        const q = f.q.toLowerCase()
        rows = rows.filter((m) => m.nome.toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q))
      }
      const fator = f.dir === 'asc' ? 1 : -1
      const t = (s: string | null) => (s ? +new Date(s) : Number.POSITIVE_INFINITY)
      rows.sort((a, b) => {
        if (f.sort === 'entrou') return ((a.entrouEm ? +new Date(a.entrouEm) : 0) - (b.entrouEm ? +new Date(b.entrouEm) : 0)) * fator
        if (f.sort === 'situacao') return (t(a.expiraEm) - t(b.expiraEm)) * fator || 0
        return a.nome.localeCompare(b.nome, 'pt-BR') * fator
      })
      const total = rows.length
      if (paginar) { const from = (f.page - 1) * f.pp; rows = rows.slice(from, from + f.pp) }
      return { rows, total }
    } catch (e: any) {
      if (COL_ERR.test(e?.message ?? String(e))) continue
      throw e
    }
  }
  return { rows: [], total: 0 }
}
