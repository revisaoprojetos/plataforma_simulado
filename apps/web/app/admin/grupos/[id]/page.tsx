import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { GrupoDetalheClient } from '@/components/admin/grupo-detalhe-client'

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

  const { data: gm } = await svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', id)
  const memberIds = new Set((gm ?? []).map((r: any) => r.estudante_id))

  const { data: todos } = await svc.from('simulado_estudantes').select('id, nome, email, classificacao').eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').eq('deletado', false).order('nome')
  const membros = (todos ?? []).filter((e: any) => memberIds.has(e.id)).map((e: any) => ({ id: e.id, nome: e.nome, email: e.email ?? null, classificacao: e.classificacao ?? null }))
  const naoMembros = (todos ?? []).filter((e: any) => !memberIds.has(e.id)).map((e: any) => ({ id: e.id, nome: e.nome, email: e.email ?? null, classificacao: e.classificacao ?? null }))

  return <GrupoDetalheClient grupo={{ id: grupo.id, nome: grupo.nome, cor: (grupo as any).cor ?? null }} membros={membros} naoMembros={naoMembros} />
}
