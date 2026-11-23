'use server'
// Simulador de faixa da aba Fluxo. Só exporta funções async (tipos: `lib/cronograma/adaptativo/fluxo-regras.ts`).
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { lerRegrasMotor } from '@/lib/cronograma/adaptativo/config-regras'
import { caminhoDaRotina, type CaminhoRotina } from '@/lib/cronograma/adaptativo/fluxo-regras'

/** Resolve a rotina (horas seg→dom) nas regras VIGENTES do tenant: faixa, teto, revisão, limites e o caminho nas árvores. Nada é gravado. */
export async function simularFaixa(horas: number[], regra23 = true): Promise<{ ok: true; dados: CaminhoRotina } | { ok: false; error: string }> {
  const a = await getCurrentAccess()
  if (!a.tenantId || !accessCan(a, 'cronogramas:view')) return { ok: false, error: 'Sem permissão.' }
  const regras = await lerRegrasMotor(createAdminClient(), a.tenantId)
  return { ok: true, dados: caminhoDaRotina(horas, regras, regra23 !== false) }
}
