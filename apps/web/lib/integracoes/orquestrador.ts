import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { resolverProviderCfg } from '@/lib/integracoes/config'
import { getAdapter } from '@/lib/integracoes/registry'
import { aplicarEntitlement } from '@/lib/integracoes/engine'
import type { Provider, EventoNormalizado, PessoaEntitlement } from '@/lib/integracoes/tipos'

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

export interface ReconcileDivergencia {
  externalId: string; produtoRef: string; produtoNome?: string | null
  statusApi: string; statusLocal: string | null; acao: 'conceder' | 'revogar'
  estudanteId: string | null; estudanteNome: string | null; estudanteEmail: string | null
}
export interface ReconcileResult {
  ok: boolean; error?: string; dry: boolean
  pull: number; concederia: number; revogaria: number; semMudanca: number
  aplicado?: { concedidos: number; revogados: number; ignorados: number; erros: number }
  divergencias: ReconcileDivergencia[]
}

/**
 * RECONCILIAÇÃO POR PULL (rede de segurança contra webhook PERDIDO): puxa as assinaturas da API do
 * provedor (fonte da verdade), compara com o estado LOCAL (`simulado_assinaturas`) e reporta/aplica
 * as divergências — inclusive REVOGAÇÕES (reembolso/cancelamento cujo webhook não chegou).
 *
 * SEGURANÇA:
 *  - `dry=true` (padrão de uso) NÃO escreve nada: só devolve o que MUDARIA (quem entraria, quem sairia
 *    e com que nome/e-mail) — para revisão humana antes de aplicar.
 *  - Só considera revogar quando a API retorna EXPLICITAMENTE status ≠ ativo. AUSÊNCIA na página puxada
 *    NÃO revoga (a paginação pode ser parcial/filtrada) — evita tirar acesso por engano.
 *  - Ao aplicar, `aplicarEntitlement` respeita `outraAtivaConcede` e `origem='integracao'` (não mexe em
 *    acesso manual). Idempotente.
 */
export async function reconciliarPull(
  tenantId: string, provider: Provider, opts: { dry: boolean; refs?: string[]; limite?: number },
): Promise<ReconcileResult> {
  const vazio = (extra: Partial<ReconcileResult>): ReconcileResult => ({ ok: false, dry: opts.dry, pull: 0, concederia: 0, revogaria: 0, semMudanca: 0, divergencias: [], ...extra })
  const cfg = await resolverProviderCfg(tenantId, provider)
  if (!cfg) return vazio({ error: 'Provedor sem credenciais/config para este tenant.' })
  const adapter = getAdapter(provider)
  if (!adapter) return vazio({ error: `Provedor "${provider}" não suportado.` })

  let pessoas: PessoaEntitlement[]
  try { pessoas = await adapter.listarPessoas(cfg, opts.refs ?? []) }
  catch (e) { return vazio({ error: (e as Error).message }) }

  const svc = createAdminClient()
  // Estado local por external_id (status + estudante).
  const locais = await fetchAll<{ external_id: string; status: string; estudante_id: string | null }>(() =>
    svc.from('simulado_assinaturas').select('external_id, status, estudante_id').eq('tenant_id', tenantId).eq('provider', provider).order('external_id', { ascending: true }))
  const localPorExt = new Map(locais.map((a) => [a.external_id, a]))

  const divergentes: { pe: PessoaEntitlement; acao: 'conceder' | 'revogar'; statusLocal: string | null; estudanteId: string | null }[] = []
  let concederia = 0, revogaria = 0, semMudanca = 0
  for (const pe of pessoas) {
    const ext = pe.entitlement.externalId
    const apiStatus = pe.entitlement.status
    const local = localPorExt.get(ext)
    const statusLocal = local?.status ?? null
    if (apiStatus === 'ativo' && statusLocal !== 'ativo') { concederia++; divergentes.push({ pe, acao: 'conceder', statusLocal, estudanteId: local?.estudante_id ?? null }) }
    else if (apiStatus !== 'ativo' && statusLocal === 'ativo') { revogaria++; divergentes.push({ pe, acao: 'revogar', statusLocal, estudanteId: local?.estudante_id ?? null }) }
    else semMudanca++
  }

  // Nomes/e-mails dos estudantes afetados (para o relatório humano).
  const estIds = [...new Set(divergentes.map((d) => d.estudanteId).filter(Boolean))] as string[]
  const nomes = new Map<string, { nome: string | null; email: string | null }>()
  if (estIds.length) {
    const ests = await fetchAll<{ id: string; nome: string | null; email: string | null }>(() =>
      svc.from('simulado_estudantes').select('id, nome, email').in('id', estIds).order('id', { ascending: true }))
    for (const e of ests) nomes.set(e.id, { nome: e.nome, email: e.email })
  }

  const limite = opts.limite ?? 200
  const divergencias: ReconcileDivergencia[] = divergentes.slice(0, limite).map((d) => ({
    externalId: d.pe.entitlement.externalId, produtoRef: d.pe.entitlement.produtoRef, produtoNome: d.pe.entitlement.produtoNome ?? null,
    statusApi: d.pe.entitlement.status, statusLocal: d.statusLocal, acao: d.acao,
    estudanteId: d.estudanteId, estudanteNome: d.estudanteId ? (nomes.get(d.estudanteId)?.nome ?? null) : null,
    estudanteEmail: d.estudanteId ? (nomes.get(d.estudanteId)?.email ?? null) : null,
  }))

  if (opts.dry) return { ok: true, dry: true, pull: pessoas.length, concederia, revogaria, semMudanca, divergencias }

  // APLICA só as divergências (idempotente; aplicarEntitlement respeita origem/outraAtiva).
  let concedidos = 0, revogados = 0, ignorados = 0, erros = 0
  for (const d of divergentes) {
    const r = await aplicarEntitlement({ tenantId, provider, pessoa: d.pe.pessoa, entitlement: d.pe.entitlement })
    if (!r.ok) erros++
    else if (r.acao === 'concedido') concedidos++
    else if (r.acao === 'revogado') revogados++
    else ignorados++
  }
  return { ok: true, dry: false, pull: pessoas.length, concederia, revogaria, semMudanca, aplicado: { concedidos, revogados, ignorados, erros }, divergencias }
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
