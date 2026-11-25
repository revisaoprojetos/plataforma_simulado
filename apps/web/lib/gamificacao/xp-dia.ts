import { chaveRelatorio } from '@/lib/cache/relatorio-cache'

/** Chave do cache (60s) do XP do dia por (tenant, estudante). Invalidada em awardXp ao gravar no ledger. */
export function chaveXpDia(tenantId: string, estudanteId: string): string {
  return chaveRelatorio(tenantId, 'xp-dia', estudanteId)
}
