import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type NovaNotificacao = { tipo?: string; titulo: string; mensagem?: string | null; link?: string | null }

/** Cria uma notificação para 1 estudante. Best-effort (tolerante à ausência da tabela). */
export async function criarNotificacao(svc: SupabaseClient, tenantId: string | null, estudanteId: string, n: NovaNotificacao): Promise<void> {
  if (!tenantId || !estudanteId) return
  try {
    await svc.from('simulado_notificacoes').insert({
      tenant_id: tenantId, estudante_id: estudanteId,
      tipo: n.tipo ?? 'info', titulo: n.titulo, mensagem: n.mensagem ?? null, link: n.link ?? null,
    })
  } catch { /* tabela ausente / falha → silencioso, não quebra o fluxo principal */ }
}

/**
 * Cria a MESMA notificação para vários estudantes (ex.: liberação de gabarito).
 * Insere em lotes de 500; best-effort. Retorna quantos foram enfileirados.
 */
export async function criarNotificacoesEmMassa(svc: SupabaseClient, tenantId: string | null, estudanteIds: string[], n: NovaNotificacao): Promise<number> {
  if (!tenantId) return 0
  const ids = [...new Set(estudanteIds.filter(Boolean))]
  if (!ids.length) return 0
  let ok = 0
  try {
    for (let i = 0; i < ids.length; i += 500) {
      const lote = ids.slice(i, i + 500).map((estudante_id) => ({
        tenant_id: tenantId, estudante_id,
        tipo: n.tipo ?? 'info', titulo: n.titulo, mensagem: n.mensagem ?? null, link: n.link ?? null,
      }))
      const { error } = await svc.from('simulado_notificacoes').insert(lote)
      if (error) break // tabela ausente ou erro → para (best-effort)
      ok += lote.length
    }
  } catch { /* silencioso */ }
  return ok
}
