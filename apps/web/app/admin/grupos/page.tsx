import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { GruposClient } from '@/components/admin/grupos-client'

// Sempre fresco: a contagem de participantes muda por import/vínculo (não pode ficar em cache).
export const dynamic = 'force-dynamic'

export default async function GruposPage() {
  const svc = createAdminClient()
  const tenantId = await getCurrentTenantId()

  // Seleciona com `cor` — se a coluna ainda não existe (migration pendente), refaz sem ela.
  let grupos: any[] | null = null
  {
    const r = await svc.from('simulado_grupos').select('id, nome, criado_em, cor').eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').eq('deletado', false).order('criado_em', { ascending: false })
    if (r.error && /cor/i.test(r.error.message)) {
      const r2 = await svc.from('simulado_grupos').select('id, nome, criado_em').eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').eq('deletado', false).order('criado_em', { ascending: false })
      grupos = r2.data
    } else grupos = r.data
  }

  // Contagem de membros por grupo. IMPORTANTE: pagina com fetchAll — há mais de 1000
  // vínculos no total e o PostgREST corta em ~1000 por resposta (senão grupos "somem"
  // da contagem, aparecendo com 0 membros mesmo tendo alunos vinculados).
  const ids = (grupos ?? []).map((g: any) => g.id)
  const membros = new Map<string, number>()
  if (ids.length) {
    const gm = await fetchAll<{ grupo_id: string }>(() =>
      svc.from('simulado_grupo_membros').select('grupo_id').in('grupo_id', ids).order('estudante_id', { ascending: true }))
    for (const m of gm) membros.set(m.grupo_id, (membros.get(m.grupo_id) ?? 0) + 1)
  }

  const rows = (grupos ?? []).map((g: any) => ({ id: g.id, nome: g.nome, membros: membros.get(g.id) ?? 0, cor: g.cor ?? null }))

  return <GruposClient grupos={rows} />
}
