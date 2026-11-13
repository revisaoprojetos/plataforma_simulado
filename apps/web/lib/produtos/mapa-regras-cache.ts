import 'server-only'
import { esquecer } from '@/lib/cache/relatorio-cache'
import { getCurrentTenantId } from '@/lib/tenant'

/** Invalida o instantâneo (20 s) do mapa de regras do produto. Best-effort; chame após QUALQUER mutação de regra/acesso. */
export async function invalidarMapaRegras(produtoId: string, tenantId?: string | null): Promise<void> {
  try {
    const t = tenantId ?? (await getCurrentTenantId())
    if (t) await esquecer(`mapa-regras:${t}:${produtoId}`)
  } catch { /* best-effort */ }
}
