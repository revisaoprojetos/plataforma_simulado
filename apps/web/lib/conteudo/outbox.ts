import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// Outbox (A6) — o evento é gravado para o worker drenar depois. O IDEAL é gravar na MESMA transação
// da mutação (via RPC plpgsql); por ora emitimos logo após a mutação (best-effort) — TODO: mover a
// criação de versão/reconciliação para uma RPC transacional que faça mutação + outbox atômico.
export type EventoConteudo = 'documento.importado' | 'documento.atualizado' | 'anotacao.reconciliar' | 'aviso.criado'

export async function emitirEvento(svc: SupabaseClient, tenantId: string, tipo: EventoConteudo, payload: Record<string, unknown>): Promise<void> {
  try {
    await svc.from('simulado_conteudo_outbox').insert({ tenant_id: tenantId, tipo, payload })
  } catch { /* não derruba a operação principal; o worker/reprocesso cobre */ }
}
