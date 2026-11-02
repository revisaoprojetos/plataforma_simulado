import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { selecionarGrupos } from '@/lib/simulado/grupos'
import { grupoContagensSql } from 'data'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { GruposListaClient, type GrupoLinha } from './grupos-lista-client'

export const dynamic = 'force-dynamic'
const SEM = '00000000-0000-0000-0000-000000000000'
const PP = [5, 10, 25, 50]

// GRUPOS DE ACESSO (Estúdio): lista com nº de membros e origem. Grupos são poucos → busca/ordenação/
// paginação em memória para alimentar a <DataTable> (server-driven). Contagem via SQL agg (fallback count).
export default async function GruposPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const access = await getCurrentAccess()
  const podeEditar = access.isAdmin || access.permissions.includes('grupos:view')
  if (!podeEditar) return <SemAcessoArea />
  const tenantId = access.tenantId ?? SEM
  const svc = createAdminClient()

  const grupos = await selecionarGrupos(svc, tenantId)
  const ids = grupos.map((g) => g.id)

  // Contagem de membros (1 agregação SQL; fallback a counts HEAD por grupo).
  const membros = new Map<string, number>()
  const contagens = await grupoContagensSql(ids, tenantId)
  if (contagens) {
    for (const id of ids) membros.set(id, 0)
    for (const c of contagens) membros.set(c.grupo_id, Number(c.total) || 0)
  } else {
    await Promise.all(ids.map(async (id) => {
      const { count } = await svc.from('simulado_grupo_membros').select('*', { count: 'exact', head: true }).eq('grupo_id', id)
      membros.set(id, count ?? 0)
    }))
  }

  // Origem real (integração) por grupo.
  const provPorGrupo = new Map<string, string>()
  try {
    const maps = await fetchAll<{ grupo_id: string | null; provider: string | null }>(() =>
      svc.from('simulado_integracao_mapeamentos').select('grupo_id, provider').eq('tenant_id', tenantId).not('grupo_id', 'is', null).order('grupo_id', { ascending: true }))
    for (const m of maps) if (m.grupo_id && m.provider && !provPorGrupo.has(m.grupo_id)) provPorGrupo.set(m.grupo_id, m.provider)
  } catch { /* tabela ausente → todos manuais */ }
  const origemDe = (g: (typeof grupos)[number]): 'guru' | 'curseduca' | null => {
    const p = provPorGrupo.get(g.id)
    if (p === 'guru') return 'guru'
    if (p === 'curseduca' || g.codigo_externo) return 'curseduca'
    return null
  }

  let all: GrupoLinha[] = grupos.map((g) => ({
    id: g.id, nome: g.nome, cor: g.cor, isMestre: g.is_mestre, membros: membros.get(g.id) ?? 0, origem: origemDe(g),
  }))

  const sp = await searchParams
  const q = (sp.q ?? '').trim().toLowerCase()
  if (q) all = all.filter((r) => r.nome.toLowerCase().includes(q))
  const origem = sp.origem ?? ''
  if (origem === 'manual') all = all.filter((r) => r.origem === null)
  else if (origem === 'guru' || origem === 'curseduca') all = all.filter((r) => r.origem === origem)
  const sortKey = sp.sort ?? 'nome'
  const asc = (sp.dir ?? 'asc') === 'asc'
  all.sort((a, b) => (sortKey === 'membros' ? a.membros - b.membros : a.nome.localeCompare(b.nome, 'pt-BR')) * (asc ? 1 : -1))
  const total = all.length
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const perPage = PP.includes(Number(sp.pp)) ? Number(sp.pp) : 10
  const rows = all.slice((page - 1) * perPage, page * perPage)

  return <GruposListaClient rows={rows} total={total} podeEditar={podeEditar} />
}
