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

  // Contagem de membros por grupo — count exato por grupo, em paralelo (HEAD, sem trazer linhas).
  // Evita paginar todos os vínculos (simulado_grupo_membros pode ter dezenas de milhares de linhas).
  const ids = grupos.map((g) => g.id)
  const membros = new Map<string, number>()
  await Promise.all(ids.map(async (id) => {
    const { count } = await svc.from('simulado_grupo_membros').select('*', { count: 'exact', head: true }).eq('grupo_id', id)
    membros.set(id, count ?? 0)
  }))

  // Origem REAL do grupo: grupos gerenciados por integração ficam referenciados em
  // simulado_integracao_mapeamentos (provider = guru/curseduca). Curseduca "por canal" grava
  // codigo_externo. Combinamos os dois; o resto é criado manualmente. (criado_em/criado_por são
  // nulos na maioria dos grupos migrados/importados — não servem de sinal.)
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

  const rows = grupos.map((g) => ({
    id: g.id,
    nome: g.nome,
    membros: membros.get(g.id) ?? 0,
    cor: g.cor,
    is_mestre: g.is_mestre,
    pai_id: g.pai_id,
    codigo: g.codigo_externo ?? null,
    origem: origemDe(g),
  }))

  return <GruposClient grupos={rows} />
}
