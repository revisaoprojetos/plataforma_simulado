import 'server-only'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { REGRAS_PADRAO } from '@/lib/cronograma/adaptativo/regras'
import { lerRegistroRegras } from '@/lib/cronograma/adaptativo/config-regras'
import type { RegistroRegras } from './regras-actions-tipos'

/** Leitura comum das páginas de regras do motor (ver = cronogramas:view; editar = cronogramas:update). A page só LÊ. */
export async function carregarPaginaRegras(): Promise<{ semAcesso: true } | { semAcesso: false; tenantId: string; podeEditar: boolean; registro: RegistroRegras }> {
  const a = await getCurrentAccess()
  if (!a.tenantId || !accessCan(a, 'cronogramas:view')) return { semAcesso: true }
  const r = await lerRegistroRegras(createAdminClient(), a.tenantId)
  return {
    semAcesso: false, tenantId: a.tenantId, podeEditar: accessCan(a, 'cronogramas:update'),
    registro: { versao: r.versao, hash: r.hash, regras: r.regras, padrao: REGRAS_PADRAO, atualizadoEm: r.atualizadoEm, atualizadoPor: r.atualizadoPor, ehPadrao: Object.keys(r.delta).length === 0 },
  }
}
