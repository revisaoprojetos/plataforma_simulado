import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { criarNotificacao } from '@/lib/notificacoes/criar'

export type NotifMode = 'mandatory_notification' | 'passive_history' | 'disabled'

const DEFAULT_MODE = (process.env.IMPERSONATION_DEFAULT_NOTIFICATION_MODE as NotifMode) || 'passive_history'

/** Modo de notificação do tenant (default `passive_history`). Tolerante à tabela ausente. */
export async function getModoNotificacao(tenantId: string): Promise<NotifMode> {
  try {
    const svc = createAdminClient()
    const { data } = await svc.from('simulado_impersonation_notification_config').select('mode').eq('tenant_id', tenantId).maybeSingle()
    return ((data as { mode?: NotifMode } | null)?.mode as NotifMode) ?? DEFAULT_MODE
  } catch {
    return DEFAULT_MODE
  }
}

/** Quando o modo é `mandatory_notification`, avisa o aluno (in-app) que sua conta foi visualizada. */
export async function notificarImpersonacaoSeNecessario(tenantId: string, estudanteId: string): Promise<void> {
  try {
    if ((await getModoNotificacao(tenantId)) !== 'mandatory_notification') return
    const svc = createAdminClient()
    await criarNotificacao(svc, tenantId, estudanteId, {
      tipo: 'info',
      titulo: 'Sua conta foi acessada por um administrador',
      mensagem: 'Um administrador visualizou sua conta para dar suporte. Nenhuma ação foi feita em seu nome (visualização somente leitura).',
    })
  } catch { /* best-effort */ }
}
