import 'server-only'
import { resolverProviderCfg } from '@/lib/integracoes/config'
import { getAdapter } from '@/lib/integracoes/registry'
import { aplicarEntitlement } from '@/lib/integracoes/engine'
import type { Provider, EventoNormalizado } from '@/lib/integracoes/tipos'

/**
 * Orquestração agnóstica de provedor. Liga adaptador (pull/push) → engine.
 * server-only e SEM 'use server' (recebe tenantId por parâmetro; não é endpoint RPC).
 * Usado pelas actions (com checagem de permissão), pelos crons (sync/reconciliação)
 * e pelo processamento de eventos de webhook.
 */

export interface ResultadoImport {
  ok: boolean
  error?: string
  total?: number
  concedidos?: number
  revogados?: number
  ignorados?: number
  erros?: number
}

/**
 * IMPORT/RECONCILIAÇÃO por PULL: coleta pessoas+direitos das fontes (grupos/produtos)
 * e aplica cada um no domínio. Idempotente. `refs` = ids de grupo (Curseduca) / produto (Guru).
 */
export async function importarViaProvider(tenantId: string, provider: Provider, refs: string[]): Promise<ResultadoImport> {
  const cfg = await resolverProviderCfg(tenantId, provider)
  if (!cfg) return { ok: false, error: 'Provedor sem credenciais/config para este tenant.' }
  const adapter = getAdapter(provider)
  if (!adapter) return { ok: false, error: `Provedor "${provider}" não suportado.` }

  let pessoas
  try {
    pessoas = await adapter.listarPessoas(cfg, refs)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  let concedidos = 0, revogados = 0, ignorados = 0, erros = 0
  for (const { pessoa, entitlement } of pessoas) {
    const r = await aplicarEntitlement({ tenantId, provider, pessoa, entitlement })
    if (!r.ok) erros++
    else if (r.acao === 'concedido') concedidos++
    else if (r.acao === 'revogado') revogados++
    else ignorados++
  }
  return { ok: true, total: pessoas.length, concedidos, revogados, ignorados, erros }
}

/**
 * PROCESSA UM EVENTO já normalizado (vindo de webhook, §6.2). Aplica o entitlement.
 * A idempotência do evento (dedupe por event_id) é responsabilidade da rota de webhook,
 * que grava em simulado_integracao_eventos ANTES de chamar isto.
 */
export async function processarEvento(tenantId: string, provider: Provider, ev: EventoNormalizado): Promise<ResultadoImport> {
  const r = await aplicarEntitlement({ tenantId, provider, pessoa: ev.pessoa, entitlement: ev.entitlement })
  if (!r.ok) return { ok: false, error: r.error, erros: 1 }
  return {
    ok: true, total: 1,
    concedidos: r.acao === 'concedido' ? 1 : 0,
    revogados: r.acao === 'revogado' ? 1 : 0,
    ignorados: r.acao === 'ignorado' ? 1 : 0,
    erros: 0,
  }
}

/** Lista as fontes (grupos/produtos) de um provedor — para a UI montar a seleção. */
export async function listarFontesProvider(tenantId: string, provider: Provider): Promise<{ ok: boolean; error?: string; fontes?: { ref: string; nome: string; total?: number }[] }> {
  const cfg = await resolverProviderCfg(tenantId, provider)
  if (!cfg) return { ok: false, error: 'Provedor sem credenciais/config.' }
  const adapter = getAdapter(provider)
  if (!adapter) return { ok: false, error: `Provedor "${provider}" não suportado.` }
  try {
    return { ok: true, fontes: await adapter.listarFontes(cfg) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
