import { headers } from 'next/headers'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { sidAtual, sidPertence, novoRequestId, registrarAcaoApiAdmin } from '@/lib/admin-rastreio/registro'
import { rotaDeUrl, normalizarRotaAdmin, normalizarRotaApi } from '@/lib/admin-rastreio/rota'

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
  /** Método HTTP da requisição (opcional; ex.: 'POST'). Compõe a "rota da API" exibida no detalhe. */
  metodo?: string
  /** Resultado do evento (default 'sucesso'). */
  status?: 'sucesso' | 'erro'
}

// Colunas de contexto (rota/rota_api/request_id/sessao_id/status) só existem após a migração 20261121100000.
let semColunasCtxAte = 0

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
    let rota: string | null = null
    let rotaApi: string | null = null
    let requestId: string | null = null
    try {
      const h = await headers()
      ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
      ua = h.get('user-agent') || null
      requestId = novoRequestId(h)
      const path = h.get('x-pathname')
      // Página de origem: Referer (chamadas de API/ações vindas do painel) ou o próprio caminho quando já é /admin.
      rota = rotaDeUrl(h.get('referer')) ?? normalizarRotaAdmin(path)
      const api = normalizarRotaApi(path)
      if (api) rotaApi = params.metodo ? `${params.metodo.toUpperCase()} ${api}` : api
      else if (path && rota) rotaApi = `${params.metodo?.toUpperCase() ?? 'POST'} ${rota} (ação do servidor)`
    } catch {
      /* fora de request */
    }
    // adm_sid é cookie do cliente: só vale se pertence ao user+tenant do ator (cache 60 s); senão null.
    const sid = await sidPertence(await sidAtual(), userId ?? null, tenantId ?? null)
    const status = params.status ?? 'sucesso'
    const ctx = { rota, rota_api: rotaApi, request_id: requestId, sessao_id: sid, status }

    const svc = createAdminClient()
    const linha = {
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
      // `ctx` fica no jsonb (sempre disponível, mesmo sem a migração) e também nas colunas novas quando existirem.
      detalhes: { antes: params.antes ?? null, depois: params.depois ?? null, ctx },
      ip,
      user_agent: ua,
      // A coluna não tem DEFAULT no banco migrado — seta explícito (senão fica null → data vazia).
      criado_em: new Date().toISOString(),
    }
    const colunas = { rota, rota_api: rotaApi, request_id: requestId, sessao_id: sid, status }
    let { error } = await svc.from('simulado_audit_logs').insert(Date.now() < semColunasCtxAte ? linha : { ...linha, ...colunas })
    if (error && Date.now() >= semColunasCtxAte && /rota|rota_api|request_id|sessao_id|status/.test(String(error.message ?? ''))) {
      semColunasCtxAte = Date.now() + 10 * 60_000
      ;({ error } = await svc.from('simulado_audit_logs').insert(linha))
    }
    if (sid && userId && tenantId && (params.atorTipo ?? 'admin') !== 'estudante' && params.operacao !== 'LOGIN' && params.operacao !== 'LOGOUT') {
      void registrarAcaoApiAdmin({ userId, tenantId, sid, rota, rotaApi, metodo: params.metodo ?? null, ip, requestId: requestId ?? '', operacao: params.operacao, entidade: params.entidade })
    }
    if (error) console.error('[audit] insert falhou:', error.message, '| ip=', ip)
  } catch (e) {
    // Auditoria nunca pode quebrar a operação de negócio.
    console.error('[audit] falha ao registrar evento:', e)
  }
}
