import { headers } from 'next/headers'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

export type AuditOperacao =
  | 'INSERT' | 'UPDATE' | 'DELETE'
  | 'LIBERAR' | 'BLOQUEAR' | 'ANULAR' | 'RECORRIGIR'
  | 'LOGIN' | 'LOGOUT' | 'BLOQUEIO_AUTOMATICO'

interface AuditParams {
  operacao: AuditOperacao
  /** Módulo/tabela alvo, ex.: 'simulado_questoes', 'simulado_simulados'. */
  entidade: string
  entidadeId?: string | null
  antes?: Record<string, unknown> | null
  depois?: Record<string, unknown> | null
  /** 'admin' | 'estudante' | 'sistema' — default inferido pela sessão. */
  atorTipo?: string
  /** Sobrescreve o ator (ex.: em rotas sem sessão Supabase). */
  atorId?: string | null
  /** Tenant alvo (default: tenant atual resolvido pelo subdomínio). */
  tenantId?: string | null
}

/**
 * Registra um evento de auditoria em simulado_audit_logs.
 * Usa service-role real (createAdminClient) — bypassa RLS e nunca deve
 * interromper a operação de negócio (erros são engolidos).
 */
export async function registrarAudit(params: AuditParams): Promise<void> {
  try {
    const tenantId = params.tenantId ?? (await getCurrentTenantId())

    let userId = params.atorId ?? null
    if (userId === null) {
      try {
        const sb = await createClient()
        const { data } = await sb.auth.getUser()
        userId = data.user?.id ?? null
      } catch {
        /* sem sessão */
      }
    }

    let ip: string | null = null
    let ua: string | null = null
    try {
      const h = await headers()
      ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
      ua = h.get('user-agent') || null
    } catch {
      /* fora de request */
    }

    const svc = createAdminClient()
    const { error } = await svc.from('simulado_audit_logs').insert({
      tenant_id: tenantId,
      actor_user_id: userId,
      ator_id: userId,
      ator_tipo: params.atorTipo ?? (userId ? 'admin' : 'sistema'),
      tabela: params.entidade,
      entidade: params.entidade,
      entidade_id: isUuid(params.entidadeId) ? params.entidadeId : null,
      operacao: params.operacao,
      dados_anteriores: params.antes ?? null,
      dados_novos: params.depois ?? null,
      detalhes: { antes: params.antes ?? null, depois: params.depois ?? null },
      ip,
      user_agent: ua,
    })
    if (error) console.error('[audit] insert falhou:', error.message, '| ip=', ip)
  } catch (e) {
    // Auditoria nunca pode quebrar a operação de negócio.
    console.error('[audit] falha ao registrar evento:', e)
  }
}
