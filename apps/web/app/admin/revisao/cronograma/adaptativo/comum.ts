import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/server'
import { remember } from '@/lib/cache/relatorio-cache'
import { crAlteradas } from '@/lib/revisao/cronograma-schema'
import { lerRegras, montarCobertura, type KpisCobertura } from '@/lib/revisao/cronograma'
import { ParamsInt, type QS } from '../../_comp/lista'

// Pedaços COMUNS das abas do Cronograma Adaptativo do shell (/admin/revisao/cronograma?aba=adaptativo&sub=<aba>&v=<vista>).
// Cada aba (cobertura/, disciplinas/, regras/, sprints/, versoes/, parametros/) é um server component próprio e só
// paga as consultas de que precisa; os KPIs do topo vêm de `kpisAdaptativo` (cache curto).

export const BASE = '/admin/revisao/cronograma'
export const PPS = [10, 14, 25, 50, 100]
export const PP_PADRAO = 14 // mesmo padrão da Biblioteca
export const porPagina = (v: string | undefined) => { const n = ParamsInt(v, PP_PADRAO); return PPS.includes(n) ? n : PP_PADRAO }

export type SubAdaptativo = 'mat' | 'disc' | 'regras' | 'sprint' | 'ver' | 'faixas' | 'especial'
export const SUBS_ADAPTATIVO: SubAdaptativo[] = ['mat', 'disc', 'regras', 'sprint', 'ver', 'faixas', 'especial']

/** Props das abas: `sp` = searchParams da página; `basePath` não é usado (a rota é sempre BASE). */
export interface PropsAbaAdaptativo { sp: QS; tenantId: string; podeEditar: boolean }

/** Aba + vista (`?sub=<aba>&v=<vista>`) de cada sub-aba implementada no shell (ver lib/admin/cronogramas-nav.ts). */
const ABA_VISTA: Record<SubAdaptativo, { sub: string; v: string }> = {
  mat: { sub: 'conteudo', v: 'cobertura' }, disc: { sub: 'conteudo', v: 'disciplinas' }, regras: { sub: 'regras', v: 'regras' },
  faixas: { sub: 'regras', v: 'faixas' }, especial: { sub: 'regras', v: 'especial' }, sprint: { sub: 'versoes', v: 'sprint' }, ver: { sub: 'versoes', v: 'versoes' },
}

export function qsAdaptativo(sp: QS, sub: SubAdaptativo): QS {
  return { aba: 'adaptativo', ...ABA_VISTA[sub], q: sp.q, disc: sp.disc, situ: sp.situ, ord: sp.ord, dir: sp.dir, pag: sp.pag, status: sp.status, pps: sp.pps }
}

/** Regras do tenant — memoizada POR REQUISIÇÃO (KPIs do topo + a aba compartilham a mesma leitura). */
export const regrasDaRequisicao = cache((tenantId: string) => lerRegras(createAdminClient(), tenantId))

/** KPIs do topo (aulas, páginas, pendentes, regras ≠ 2.0): a base de cobertura é cacheada 60 s; as regras são lidas ao vivo. */
export async function kpisAdaptativo(tenantId: string): Promise<KpisCobertura & { alteradas: number } | null> {
  try {
    const [regras, k] = await Promise.all([
      regrasDaRequisicao(tenantId),
      remember<KpisCobertura>(`revisao-cron:kpis:${tenantId}`, 60, async () => (await montarCobertura(createAdminClient(), tenantId, (await regrasDaRequisicao(tenantId)).valores)).kpis),
    ])
    return { ...k, alteradas: crAlteradas(regras.valores).length }
  } catch {
    return null
  }
}
