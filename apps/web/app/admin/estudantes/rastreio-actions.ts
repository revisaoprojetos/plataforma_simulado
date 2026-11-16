'use server'

import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { rastreioLote, type RastreioLinha } from '@/lib/acessos/leitura'

/**
 * Rastreio (último acesso / aparelho·IP / sessões·tempo 30d) de UMA PÁGINA de alunos (≤200 ids).
 * Só devolve algo para quem tem `acessos:view` — senão `null` (a UI esconde as colunas).
 */
export async function rastreioDaPagina(ids: string[]): Promise<Record<string, RastreioLinha> | null> {
  if (!(await checkPermission('acessos:view').catch(() => false))) return null
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return null
  const limpos = [...new Set((ids ?? []).filter((i) => typeof i === 'string' && i.length > 0))].slice(0, 200)
  if (!limpos.length) return {}
  return rastreioLote(tenantId, limpos)
}
