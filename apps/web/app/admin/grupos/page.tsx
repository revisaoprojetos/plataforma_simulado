import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { selecionarGrupos } from '@/lib/simulado/grupos'
import { GruposClient } from '@/components/admin/grupos-client'

// Sempre fresco: a contagem de participantes muda por import/vínculo (não pode ficar em cache).
export const dynamic = 'force-dynamic'

export default async function GruposPage() {
  const svc = createAdminClient()
  const tenantId = (await getCurrentTenantId()) ?? '00000000-0000-0000-0000-000000000000'

  // Grupos (tolerante a cor/pai_id/is_mestre ausentes) já ordenados por nome.
  const grupos = await selecionarGrupos(svc, tenantId, { comData: true })

  // Contagem de membros por grupo. IMPORTANTE: pagina com fetchAll — há mais de 1000
  // vínculos no total e o PostgREST corta em ~1000 por resposta (senão grupos "somem"
  // da contagem, aparecendo com 0 membros mesmo tendo alunos vinculados).
  const ids = grupos.map((g) => g.id)
  const membros = new Map<string, number>()
  if (ids.length) {
    const gm = await fetchAll<{ grupo_id: string }>(() =>
      svc.from('simulado_grupo_membros').select('grupo_id').in('grupo_id', ids).order('id', { ascending: true }))
    for (const m of gm) membros.set(m.grupo_id, (membros.get(m.grupo_id) ?? 0) + 1)
  }

  const rows = grupos.map((g) => ({
    id: g.id,
    nome: g.nome,
    membros: membros.get(g.id) ?? 0,
    cor: g.cor,
    is_mestre: g.is_mestre,
    pai_id: g.pai_id,
  }))

  return <GruposClient grupos={rows} />
}
