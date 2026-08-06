import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { remember, chaveRelatorio } from '@/lib/cache/relatorio-cache'

const SEM = '00000000-0000-0000-0000-000000000000'

/**
 * Contagens para os badges da sidebar admin (quantos simulados, questões, bancos, cadernos,
 * estudantes, grupos, matrículas). Cacheado por tenant com TTL CURTO (45s): a sidebar aparece
 * em TODA navegação, então não pode disparar 7 counts por page load. Degrada sem Redis (computa
 * direto). Cada count é tolerante — tabela/coluna ausente vira 0, sem derrubar o menu.
 */
export async function contagensSidebar(tenantId: string | null): Promise<Record<string, number>> {
  const tid = tenantId ?? SEM
  return remember<Record<string, number>>(chaveRelatorio(tenantId, 'sidebar-contagens'), 45, async () => {
    const svc = createAdminClient()
    const cont = (b: any): Promise<number> => b.then((r: any) => r.count ?? 0, () => 0)
    const head = (tabela: string) => svc.from(tabela).select('id', { count: 'exact', head: true }).eq('tenant_id', tid)
    const [simulados, questoes, bancos, cadernos, estudantes, grupos, matriculas] = await Promise.all([
      cont(head('simulado_simulados').eq('deletado', false)),
      cont(head('simulado_questoes').eq('deletado', false)),
      cont(head('simulado_pastas').eq('deletado', false).eq('is_folder', false)),
      cont(head('simulado_cadernos_designer')),
      cont(head('simulado_estudantes').eq('deletado', false)),
      cont(head('simulado_grupos').eq('deletado', false)),
      cont(head('simulado_matriculas')),
    ])
    return {
      '/admin/simulados': simulados,
      '/admin/questoes': questoes,
      '/admin/banco-questoes': bancos,
      '/admin/cadernos': cadernos,
      '/admin/estudantes': estudantes,
      '/admin/grupos': grupos,
      '/admin/matriculas': matriculas,
    }
  })
}
