import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { buscarBancosVinculaveis } from '@/app/admin/conteudos/grupos/actions'
import { consultarMembros, normalizarFiltros } from '@/app/admin/conteudos/grupos/membros-query'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { GrupoEditarClient, type GrupoTab, type MembroLinha } from './grupo-editar-client'

export const dynamic = 'force-dynamic'
const SEM = '00000000-0000-0000-0000-000000000000'
const TABS: GrupoTab[] = ['informacoes', 'bancos', 'membros', 'integracoes']
const PP = [5, 10, 25, 50]

// GRUPO › editor (Informações · Bancos · Membros · Integrações). A aba Membros é paginada/filtrada no
// servidor; as demais usam só os contadores. O grupo é criado na lista e aberto pelo id real (sem rota 'novo').
export default async function GrupoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const access = await getCurrentAccess()
  const podeEditar = access.isAdmin || access.permissions.includes('grupos:view')
  if (!podeEditar) return <SemAcessoArea />
  const { id } = await params
  const sp = await searchParams
  const tab: GrupoTab = TABS.includes(sp.tab as GrupoTab) ? (sp.tab as GrupoTab) : 'informacoes'
  const tid = access.tenantId ?? SEM
  const svc = createAdminClient()

  // Grupo (colunas tolerantes — cor/pai_id/is_mestre/codigo_externo podem não ter migrado).
  let grupo: any = null
  for (const cols of ['id, nome, cor, descricao, is_mestre, pai_id, codigo_externo', 'id, nome, cor, descricao', 'id, nome']) {
    const r = await svc.from('simulado_grupos').select(cols).eq('id', id).eq('tenant_id', tid).eq('deletado', false).maybeSingle()
    if (!r.error) { grupo = r.data; break }
    if (!/column|does not exist|cor|pai_id|is_mestre|codigo_externo|descricao/i.test(r.error.message)) break
  }
  if (!grupo) notFound()

  // Origem (integração).
  let origem: 'guru' | 'curseduca' | null = null
  try {
    const maps = await fetchAll<{ provider: string | null }>(() =>
      svc.from('simulado_integracao_mapeamentos').select('provider').eq('tenant_id', tid).eq('grupo_id', id).order('provider', { ascending: true }))
    const p = maps.find((m) => m.provider)?.provider
    if (p === 'guru') origem = 'guru'
    else if (p === 'curseduca' || grupo.codigo_externo) origem = 'curseduca'
  } catch { if (grupo.codigo_externo) origem = 'curseduca' }

  // Bancos vinculáveis (ação já self-guarded por grupos:view + tenant).
  const rb = await buscarBancosVinculaveis(id)
  const bancos = rb.ok && rb.itens ? rb.itens : []
  const bancosVinculadosCount = bancos.filter((b) => b.vinculado).length
  const produtosPreview = bancos.filter((b) => b.vinculado).map((b) => ({ id: b.id, nome: b.nome }))

  // Total de membros (sempre — header + badge da aba).
  const { count: membrosTotal } = await svc.from('simulado_grupo_membros')
    .select('estudante_id', { count: 'exact', head: true }).eq('grupo_id', id).eq('tenant_id', tid)

  let membrosPage: MembroLinha[] = []
  let membrosFiltrados = 0
  if (tab === 'membros') {
    // Filtros (busca/situação/entrou/ordenação/paginação) aplicados no servidor, no banco quando possível.
    const r = await consultarMembros(tid, id, normalizarFiltros(sp))
    membrosPage = r.rows
    membrosFiltrados = r.total
  }

  // Aba Produtos: bancos vinculados, com busca/ordenação/paginação server-side (lista pequena, em memória).
  const vinculados = bancos.filter((b) => b.vinculado)
  let bancosPage = vinculados
  let bancosFiltrados = vinculados.length
  if (tab === 'bancos') {
    const q = (sp.q ?? '').trim().toLowerCase()
    let lista = q ? vinculados.filter((b) => b.nome.toLowerCase().includes(q)) : vinculados.slice()
    const asc = (sp.dir ?? 'asc') === 'asc'
    lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') * (asc ? 1 : -1))
    bancosFiltrados = lista.length
    const page = Math.max(1, Number(sp.page ?? 1) || 1)
    const perPage = PP.includes(Number(sp.pp)) ? Number(sp.pp) : 10
    bancosPage = lista.slice((page - 1) * perPage, page * perPage)
  }

  return (
    <GrupoEditarClient
      grupo={{
        id: grupo.id, nome: grupo.nome, cor: grupo.cor ?? null, descricao: grupo.descricao ?? null,
        isMestre: grupo.is_mestre === true, paiId: grupo.pai_id ?? null, codigo: grupo.codigo_externo ?? null, origem,
      }}
      tab={tab}
      podeEditar={podeEditar}
      membrosTotal={membrosTotal ?? 0}
      bancosVinculadosCount={bancosVinculadosCount}
      bancosPage={bancosPage}
      bancosFiltrados={bancosFiltrados}
      produtosPreview={produtosPreview}
      membrosPage={membrosPage}
      membrosFiltrados={membrosFiltrados}
    />
  )
}
