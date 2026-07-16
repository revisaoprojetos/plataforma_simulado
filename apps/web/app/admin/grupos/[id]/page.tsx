import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { GrupoDetalheClient } from '@/components/admin/grupo-detalhe-client'

// Sempre fresco: os membros do grupo mudam por import/vínculo e não podem ficar em cache.
export const dynamic = 'force-dynamic'

export default async function GrupoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  // Grupo (cor é tolerante caso a migration ainda não tenha rodado).
  let grupo: any = null
  {
    const r = await svc.from('simulado_grupos').select('id, nome, cor').eq('id', id).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').eq('deletado', false).maybeSingle()
    if (r.error && /cor/i.test(r.error.message)) {
      const r2 = await svc.from('simulado_grupos').select('id, nome').eq('id', id).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').eq('deletado', false).maybeSingle()
      grupo = r2.data
    } else grupo = r.data
  }
  if (!grupo) notFound()

  // IMPORTANTE: pagina com fetchAll. Um grupo pode ter >1000 membros e o tenant tem >1000
  // estudantes — sem paginar, o PostgREST corta em ~1000 e alunos vinculados somem do grupo
  // (ex.: quem está alfabeticamente após o 1000º nome nunca era carregado).
  const gm = await fetchAll<{ estudante_id: string }>(() =>
    svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', id).order('estudante_id', { ascending: true }))
  const memberIds = new Set(gm.map((r) => r.estudante_id))

  const todos = await fetchAll<any>(() =>
    svc.from('simulado_estudantes').select('id, nome, email, classificacao').eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').eq('deletado', false).order('nome', { ascending: true }).order('id', { ascending: true }))
  const membros = todos.filter((e: any) => memberIds.has(e.id)).map((e: any) => ({ id: e.id, nome: e.nome, email: e.email ?? null, classificacao: e.classificacao ?? null }))
  const naoMembros = todos.filter((e: any) => !memberIds.has(e.id)).map((e: any) => ({ id: e.id, nome: e.nome, email: e.email ?? null, classificacao: e.classificacao ?? null }))

  return <GrupoDetalheClient grupo={{ id: grupo.id, nome: grupo.nome, cor: (grupo as any).cor ?? null }} membros={membros} naoMembros={naoMembros} />
}
