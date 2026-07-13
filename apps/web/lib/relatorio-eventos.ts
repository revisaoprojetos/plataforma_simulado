import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

type Evento = {
  tenantId: string
  simuladoId: string
  estudanteId?: string | null
  sessaoId?: string | null
  tipo: 'visualizou' | 'baixou'
}

/**
 * Registra um evento de engajamento com relatório (visualizou/baixou).
 * Best-effort: qualquer erro (ex.: tabela ainda não migrada) é silencioso para
 * não quebrar o fluxo de resultado/PDF.
 */
export async function registrarRelatorioEvento(svc: SupabaseClient, e: Evento): Promise<void> {
  try {
    await svc.from('simulado_relatorio_eventos').insert({
      tenant_id: e.tenantId,
      simulado_id: e.simuladoId,
      estudante_id: e.estudanteId ?? null,
      sessao_id: e.sessaoId ?? null,
      tipo: e.tipo,
    })
  } catch {
    // ignora
  }
}
