import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { resolverEstudante, aplicarEntitlement } from '@/lib/integracoes/engine'
// UNIFICAÇÃO: materialização via o catálogo de Produtos (conceder.ts) — um só caminho de concessão.
import { concederItem, revogarItem, cobertosPorOutros } from '@/lib/produtos/conceder'
import {
  match, classificarStatus, calcularInicio, calcularFim, estadoInicialGrant, temAcessoEfetivo,
} from './motor'
import type {
  PedidoNormalizado, Regra, RegraFiltros, InicioConfig, FimConfig, ClassificacaoStatus,
  SimulacaoRegra, ResultadoSimulacao,
} from './tipos'
import type { ItemTipo } from '@/lib/produtos/tipos'
import { sincronizarAlunoProduto } from '@/lib/video/sync'
import type { Provider, PessoaNormalizada, Entitlement, ResultadoEntitlement } from '@/lib/integracoes/tipos'

/**
 * FASE 2 — LIGAÇÃO do motor de regras ao domínio (ver PROMPT_REGRAS_LIBERACAO_ACESSO.md).
 *
 * Fluxo de um pedido de venda (vindo de webhook/pull/manual):
 *   classifica status → grava o PEDIDO normalizado → avalia as REGRAS ativas (AND estrito).
 *   - positivo + regra(s) casaram → cria/atualiza GRANTS (datas calculadas) e RECONCILIA (materializa).
 *   - positivo + nada casou      → fallback AUTO-MAP (engine atual), estado 'no_matching_rule'/'blocked_by_paused_rule'.
 *   - negativo                   → revoga os GRANTS do pedido e reconcilia; se nunca teve grant → auto-map revoke.
 *
 * Os GRANTS são a FONTE DE VERDADE; um RECONCILIADOR materializa cada grant ativo pelos ITENS do
 * PRODUTO (catálogo unificado `simulado_produto_itens`) via `lib/produtos/conceder` (concederItem/
 * revogarItem/cobertosPorOutros) — o MESMO caminho de concessão do catálogo, com `origem='integracao'`.
 * Assim TODOS os gates atuais do aluno continuam valendo SEM mudança. Tudo idempotente e auditado.
 *
 * UNIFICAÇÃO: regras (aqui, via access_grants) e fontes/manual (catálogo, via assinaturas) concedem o
 * MESMO produto e materializam pelos MESMOS itens. Prioridade: regra casou → manda; nada casou → o
 * fallback `aplicarEntitlement` cuida do auto-map + fontes do produto (hook aplicarProdutosPorFonte).
 *
 * server-only e SEM 'use server' (recebe tenantId por parâmetro; não é endpoint RPC).
 */

function log(e: unknown, ctx?: string): void {
  // eslint-disable-next-line no-console
  console.error(`[liberacao]${ctx ? ' ' + ctx : ''}:`, e instanceof Error ? e.message : String(e))
}

interface ItemDoProduto { tipo: ItemTipo; itemId: string }

// ─────────────────────────────────────────────────────────────────────────────
// Leitura de configuração (regras, produtos, status)
// ─────────────────────────────────────────────────────────────────────────────

/** Overrides de classificação de status do tenant (global '' + específico do provedor; específico vence). */
async function overridesStatus(svc: any, tenantId: string, provider: string): Promise<Record<string, ClassificacaoStatus>> {
  const out: Record<string, ClassificacaoStatus> = {}
  try {
    const { data } = await svc.from('simulado_status_mappings')
      .select('provider, valor_normalizado, classificacao').eq('tenant_id', tenantId)
    const linhas = (data ?? []).filter((r: any) => r.provider === '' || r.provider === provider)
    // global primeiro, provedor-específico por último (precedência).
    linhas.sort((a: any, b: any) => (a.provider === '' ? 0 : 1) - (b.provider === '' ? 0 : 1))
    for (const r of linhas) out[r.valor_normalizado] = r.classificacao
  } catch { /* tabela ausente (migração pendente) */ }
  return out
}

function normalizarFiltros(f: any): RegraFiltros {
  return {
    plataformas: Array.isArray(f?.plataformas) ? f.plataformas : [],
    produtos: Array.isArray(f?.produtos) ? f.produtos : [],
    ofertas: Array.isArray(f?.ofertas) ? f.ofertas : [],
    periodoDe: f?.periodoDe ?? null,
    periodoAte: f?.periodoAte ?? null,
    aplicarATudo: !!f?.aplicarATudo,
  }
}

/** Carrega regras ATIVAS e PAUSADAS do tenant + os produtos que cada uma concede. */
async function carregarRegras(svc: any, tenantId: string): Promise<{ regra: Regra; produtoIds: string[] }[]> {
  let regras: any[] = []
  try {
    const { data } = await svc.from('simulado_liberacao_regras')
      .select('id, nome, status, prioridade, filtros, inicio, fim')
      .eq('tenant_id', tenantId).in('status', ['active', 'paused']).order('prioridade', { ascending: true })
    regras = data ?? []
  } catch { return [] }
  const ids = regras.map((r) => r.id)
  const prodPorRegra = new Map<string, string[]>()
  if (ids.length) {
    try {
      const { data: rp } = await svc.from('simulado_liberacao_regra_produtos').select('regra_id, produto_id').in('regra_id', ids)
      for (const r of rp ?? []) { const a = prodPorRegra.get(r.regra_id) ?? []; a.push(r.produto_id); prodPorRegra.set(r.regra_id, a) }
    } catch { /* ignora */ }
  }
  return regras.map((r) => ({
    regra: {
      id: r.id, nome: r.nome, status: r.status, prioridade: r.prioridade ?? 100,
      filtros: normalizarFiltros(r.filtros), inicio: (r.inicio ?? { tipo: 'immediate' }) as InicioConfig, fim: (r.fim ?? { tipo: 'lifetime' }) as FimConfig,
    },
    produtoIds: prodPorRegra.get(r.id) ?? [],
  }))
}

/** Itens do produto (o que ele libera) — catálogo UNIFICADO (simulado_produto_itens). */
async function itensDoProduto(svc: any, tenantId: string, produtoId: string): Promise<ItemDoProduto[]> {
  try {
    const { data } = await svc.from('simulado_produto_itens').select('tipo_item, item_id, ativo').eq('tenant_id', tenantId).eq('produto_id', produtoId)
    return (data ?? []).filter((e: any) => e.ativo !== false).map((e: any) => ({ tipo: e.tipo_item as ItemTipo, itemId: e.item_id }))
  } catch { return [] }
}

/** Tier (passaporte/vitalicio/normal) do produto — para elevar a classificação do aluno. */
async function tierDoProduto(svc: any, tenantId: string, produtoId: string): Promise<string | null> {
  try {
    const { data } = await svc.from('simulado_produtos').select('tier').eq('tenant_id', tenantId).eq('id', produtoId).maybeSingle()
    return data?.tier ?? null
  } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pedidos e grants (persistência)
// ─────────────────────────────────────────────────────────────────────────────

async function upsertPedido(svc: any, tenantId: string, provider: string, pedido: PedidoNormalizado, extras: {
  pedidoId: string; statusBruto: string | null; classificacao: ClassificacaoStatus; eventId?: string | null
  compradorNome?: string | null; compradorEmail?: string | null; compradorTelefone?: string | null; payload?: unknown
}): Promise<string | null> {
  try {
    const { data, error } = await svc.from('simulado_liberacao_pedidos').upsert({
      tenant_id: tenantId, provider, pedido_id: extras.pedidoId,
      produto_ref_id: pedido.produtoId, produto_nome: pedido.produtoNome,
      oferta_ref_id: pedido.ofertaId, oferta_nome: pedido.ofertaNome,
      comprador_nome: extras.compradorNome ?? null, comprador_email: extras.compradorEmail ?? null, comprador_telefone: extras.compradorTelefone ?? null,
      data_compra: pedido.dataCompra, status_bruto: extras.statusBruto, status_classificacao: extras.classificacao,
      event_id: extras.eventId ?? null, payload: extras.payload ?? {}, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'provider,pedido_id' }).select('id').single()
    if (error) { log(error, 'upsertPedido'); return null }
    return data.id
  } catch (e) { log(e, 'upsertPedido'); return null }
}

async function setProcessingState(svc: any, pedidoRowId: string, state: string): Promise<void> {
  try { await svc.from('simulado_liberacao_pedidos').update({ processing_state: state, ultima_avaliacao_em: new Date().toISOString() }).eq('id', pedidoRowId) } catch (e) { log(e, 'setProcessingState') }
}

async function upsertGrant(svc: any, tenantId: string, g: {
  estudanteId: string; produtoId: string; pedidoRowId: string | null; regraId: string | null
  inicioEm: string; fimEm: string | null; status: 'scheduled' | 'active' | 'expired'
}): Promise<void> {
  try {
    await svc.from('simulado_access_grants').upsert({
      tenant_id: tenantId, estudante_id: g.estudanteId, produto_id: g.produtoId, pedido_id: g.pedidoRowId, regra_id: g.regraId,
      inicio_em: g.inicioEm, fim_em: g.fimEm, status: g.status, revogado_em: null, motivo_revogacao: null, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'pedido_id,regra_id,produto_id' })
  } catch (e) { log(e, 'upsertGrant') }
}

/** Revoga os grants de um pedido (reembolso/cancelamento). Retorna os pares (estudante,produto) afetados. */
async function revogarGrantsDoPedido(svc: any, pedidoRowId: string, motivo: string): Promise<{ estudanteId: string; produtoId: string }[]> {
  try {
    const { data } = await svc.from('simulado_access_grants').select('estudante_id, produto_id').eq('pedido_id', pedidoRowId).neq('status', 'revoked')
    if (!data?.length) return []
    await svc.from('simulado_access_grants').update({ status: 'revoked', revogado_em: new Date().toISOString(), motivo_revogacao: motivo, atualizado_em: new Date().toISOString() }).eq('pedido_id', pedidoRowId).neq('status', 'revoked')
    return data.map((g: any) => ({ estudanteId: g.estudante_id, produtoId: g.produto_id }))
  } catch (e) { log(e, 'revogarGrantsDoPedido'); return [] }
}

// ─────────────────────────────────────────────────────────────────────────────
// RECONCILIADOR: grants (fonte de verdade) → tabelas de acesso existentes
// ─────────────────────────────────────────────────────────────────────────────

/** Há grant ATIVO cobrindo `agora` para (estudante, produto)? */
async function temAcessoProduto(svc: any, tenantId: string, estId: string, produtoId: string, agora: Date): Promise<boolean> {
  try {
    const { data } = await svc.from('simulado_access_grants').select('status, inicio_em, fim_em').eq('tenant_id', tenantId).eq('estudante_id', estId).eq('produto_id', produtoId)
    return temAcessoEfetivo((data ?? []).map((g: any) => ({ status: g.status, startsAt: g.inicio_em, endsAt: g.fim_em })), agora)
  } catch { return false }
}

/**
 * Reconcilia (estudante, produto): se tem grant ATIVO → materializa os ITENS do produto (via conceder.ts,
 * o MESMO caminho do catálogo) e eleva o tier; senão → remove os itens que NENHUMA outra fonte ativa
 * (outro grant OU assinatura) ainda garante (`cobertosPorOutros` cobre as duas origens). Idempotente.
 */
async function reconciliarEstudanteProduto(svc: any, tenantId: string, estId: string, produtoId: string, agora: Date): Promise<void> {
  const tem = await temAcessoProduto(svc, tenantId, estId, produtoId, agora)
  const itens = await itensDoProduto(svc, tenantId, produtoId)
  if (tem) {
    for (const it of itens) await concederItem(svc, tenantId, estId, it.tipo, it.itemId, 'integracao')
    const tier = await tierDoProduto(svc, tenantId, produtoId)
    if (tier && tier !== 'normal') {
      try { await svc.from('simulado_estudantes').update({ classificacao: tier }).eq('id', estId).eq('tenant_id', tenantId) } catch (e) { log(e, 'reconciliar/tier') }
    }
  } else {
    const cobertos = await cobertosPorOutros(svc, tenantId, estId, produtoId) // Set<"tipo:item_id"> de outros produtos ativos
    for (const it of itens) {
      if (cobertos.has(`${it.tipo}:${it.itemId}`)) continue
      await revogarItem(svc, tenantId, estId, it.tipo, it.itemId)
    }
  }
  // Vídeo próprio: enfileira enroll/revoke dos cursos de vídeo do produto (idempotente; nunca lança;
  // no-op sem video_empresas ativa). Ver docs/video/INTEGRACAO-LIBERACAO.md.
  await sincronizarAlunoProduto(tenantId, estId, produtoId, agora)
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrada principal: aplicar um pedido com as regras (fallback auto-map)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultadoPedido extends ResultadoEntitlement {
  via?: 'regra' | 'auto-map'
  processingState?: string
}

export async function aplicarPedidoComRegras(params: {
  tenantId: string; provider: Provider; pessoa: PessoaNormalizada; entitlement: Entitlement
  payload?: unknown; agora?: Date
}): Promise<ResultadoPedido> {
  const { tenantId, provider, pessoa, entitlement } = params
  const agora = params.agora ?? new Date()
  const svc = createAdminClient()

  const pedido: PedidoNormalizado = {
    plataforma: provider,
    produtoId: entitlement.produtoRef ?? null,
    produtoNome: entitlement.produtoNome ?? null,
    ofertaId: entitlement.ofertaRef ?? null,
    ofertaNome: entitlement.ofertaNome ?? null,
    dataCompra: entitlement.dataCompra ?? null,
  }

  // classifica status: status_mappings (override) → padrões; se não mapeado, cai no status do adapter.
  const overrides = await overridesStatus(svc, tenantId, provider)
  const cls = classificarStatus(entitlement.statusBruto, overrides)
  const classificacao: ClassificacaoStatus = cls.mapeado ? cls.classificacao : (entitlement.status === 'ativo' ? 'positive' : 'negative')

  const pedidoRowId = await upsertPedido(svc, tenantId, provider, pedido, {
    pedidoId: entitlement.externalId, statusBruto: entitlement.statusBruto ?? entitlement.status, classificacao,
    compradorNome: pessoa.nome, compradorEmail: (pessoa.email ?? '').trim().toLowerCase() || null, compradorTelefone: pessoa.telefone ?? null,
    payload: params.payload ?? {},
  })

  if (classificacao === 'neutral') {
    if (pedidoRowId) await setProcessingState(svc, pedidoRowId, 'ignored')
    return { ok: true, acao: 'ignorado', motivo: 'status neutro (não concede nem revoga)', processingState: 'ignored' }
  }

  const estudanteId = await resolverEstudante(svc, tenantId, provider, pessoa)
  if (!estudanteId) return { ok: false, acao: 'ignorado', error: 'não foi possível resolver/criar o estudante (sem e-mail/CPF?)' }

  const regras = await carregarRegras(svc, tenantId)
  const casadas = regras.filter((r) => r.regra.status === 'active' && match(pedido, r.regra.filtros).casou)
  const soPausadas = !casadas.length && regras.some((r) => r.regra.status === 'paused' && match(pedido, r.regra.filtros).casou)

  if (classificacao === 'positive') {
    if (casadas.length) {
      const produtos = new Set<string>()
      for (const { regra, produtoIds } of casadas) {
        const inicioEm = calcularInicio(regra.inicio, pedido.dataCompra, agora)
        const fimEm = calcularFim(regra.fim, pedido.dataCompra, agora)
        const status = estadoInicialGrant(inicioEm, fimEm, agora)
        for (const pid of produtoIds) { await upsertGrant(svc, tenantId, { estudanteId, produtoId: pid, pedidoRowId, regraId: regra.id, inicioEm, fimEm, status }); produtos.add(pid) }
      }
      for (const pid of produtos) await reconciliarEstudanteProduto(svc, tenantId, estudanteId, pid, agora)
      if (pedidoRowId) await setProcessingState(svc, pedidoRowId, 'granted')
      await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_access_grants', entidadeId: estudanteId, tenantId, depois: { via: 'regra', provider, pedido: entitlement.externalId, regras: casadas.map((c) => c.regra.id), produtos: [...produtos] } }).catch(() => {})
      return { ok: true, estudanteId, acao: 'concedido', via: 'regra', processingState: 'granted' }
    }
    // nada casou → FALLBACK auto-map (comportamento atual preservado).
    const estado = soPausadas ? 'blocked_by_paused_rule' : 'no_matching_rule'
    if (pedidoRowId) await setProcessingState(svc, pedidoRowId, estado)
    const r = await aplicarEntitlement({ tenantId, provider, pessoa, entitlement })
    return { ...r, via: 'auto-map', processingState: estado }
  }

  // NEGATIVO: revoga os grants deste pedido + reconcilia; se nunca teve grant de regra → auto-map revoke.
  const afetados = pedidoRowId ? await revogarGrantsDoPedido(svc, pedidoRowId, entitlement.statusBruto ?? entitlement.status) : []
  if (afetados.length) {
    for (const { estudanteId: eid, produtoId } of afetados) await reconciliarEstudanteProduto(svc, tenantId, eid, produtoId, agora)
    if (pedidoRowId) await setProcessingState(svc, pedidoRowId, 'revoked')
    await registrarAudit({ operacao: 'BLOQUEAR', entidade: 'simulado_access_grants', entidadeId: estudanteId, tenantId, depois: { via: 'regra', provider, pedido: entitlement.externalId, motivo: entitlement.statusBruto ?? entitlement.status } }).catch(() => {})
    return { ok: true, estudanteId, acao: 'revogado', via: 'regra', processingState: 'revoked' }
  }
  const r = await aplicarEntitlement({ tenantId, provider, pessoa, entitlement })
  return { ...r, via: 'auto-map' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transições de calendário (cron): scheduled→active, active→expired
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumoTransicoes { tenantId: string; ativados: number; expirados: number; reconciliados: number }

/** Promove/expira grants pela data e reconcilia o acesso efetivo. Idempotente. */
export async function processarTransicoesGrants(tenantId: string, agora: Date = new Date()): Promise<ResumoTransicoes> {
  const svc = createAdminClient()
  const nowIso = agora.toISOString()
  const reconc = new Set<string>()

  const ativar = await fetchAll<{ id: string; estudante_id: string; produto_id: string; fim_em: string | null }>(() =>
    svc.from('simulado_access_grants').select('id, estudante_id, produto_id, fim_em')
      .eq('tenant_id', tenantId).eq('status', 'scheduled').lte('inicio_em', nowIso).order('id', { ascending: true }))
  for (const g of ativar) {
    const jaExpirou = !!g.fim_em && +new Date(g.fim_em) <= +agora
    try { await svc.from('simulado_access_grants').update({ status: jaExpirou ? 'expired' : 'active', atualizado_em: nowIso }).eq('id', g.id) } catch (e) { log(e, 'transicao/ativar') }
    reconc.add(`${g.estudante_id}|${g.produto_id}`)
  }

  const expirar = await fetchAll<{ id: string; estudante_id: string; produto_id: string }>(() =>
    svc.from('simulado_access_grants').select('id, estudante_id, produto_id')
      .eq('tenant_id', tenantId).eq('status', 'active').not('fim_em', 'is', null).lte('fim_em', nowIso).order('id', { ascending: true }))
  for (const g of expirar) {
    try { await svc.from('simulado_access_grants').update({ status: 'expired', atualizado_em: nowIso }).eq('id', g.id) } catch (e) { log(e, 'transicao/expirar') }
    reconc.add(`${g.estudante_id}|${g.produto_id}`)
  }

  for (const key of reconc) { const [est, prod] = key.split('|'); await reconciliarEstudanteProduto(svc, tenantId, est, prod, agora) }
  return { tenantId, ativados: ativar.length, expirados: expirar.length, reconciliados: reconc.size }
}

/** Exposto para reuso (Fase 3 reprocessamento, dry-run): reconcilia um par explicitamente. */
export async function reconciliarUm(tenantId: string, estudanteId: string, produtoId: string, agora: Date = new Date()): Promise<void> {
  await reconciliarEstudanteProduto(createAdminClient(), tenantId, estudanteId, produtoId, agora)
}

// ═════════════════════════════════════════════════════════════════════════════
// FASE 3 — Reprocessamento retroativo (§7.1), ciclo de vida (§7.2), dry-run (§8)
// ═════════════════════════════════════════════════════════════════════════════

const COLS_PEDIDO = 'id, provider, pedido_id, produto_ref_id, produto_nome, oferta_ref_id, oferta_nome, data_compra, status_classificacao, comprador_nome, comprador_email, comprador_telefone, processing_state'

function pedidoDaRow(row: any): PedidoNormalizado {
  return {
    plataforma: row.provider,
    produtoId: row.produto_ref_id ?? null, produtoNome: row.produto_nome ?? null,
    ofertaId: row.oferta_ref_id ?? null, ofertaNome: row.oferta_nome ?? null,
    dataCompra: row.data_compra ?? null,
  }
}

/** Lookup de estudante SEM criar (para dry-run e reprocessamento onde já deve existir). */
async function resolverEstudanteSemCriar(svc: any, tenantId: string, email: string | null, cpf: string | null, externalId: string | null): Promise<string | null> {
  const e = (email ?? '').trim().toLowerCase() || null
  const c = (cpf ?? '').replace(/\D/g, '') || null
  const tenta = async (col: string, val: string | null): Promise<string | null> => {
    if (!val) return null
    try { const { data } = await svc.from('simulado_estudantes').select('id').eq('tenant_id', tenantId).eq(col, val).eq('deletado', false).maybeSingle(); return data?.id ?? null } catch { return null }
  }
  return (await tenta('matricula_externa', externalId)) || (await tenta('email', e)) || (await tenta('cpf', c))
}

/** Aplica os grants das regras casadas a um pedido (datas calculadas) e reconcilia. Retorna produtos tocados. */
async function concederCasadas(svc: any, tenantId: string, row: any, estudanteId: string, casadas: { regra: Regra; produtoIds: string[] }[], agora: Date): Promise<string[]> {
  const produtos = new Set<string>()
  for (const { regra, produtoIds } of casadas) {
    const inicioEm = calcularInicio(regra.inicio, row.data_compra ?? null, agora)
    const fimEm = calcularFim(regra.fim, row.data_compra ?? null, agora)
    const status = estadoInicialGrant(inicioEm, fimEm, agora)
    for (const pid of produtoIds) { await upsertGrant(svc, tenantId, { estudanteId, produtoId: pid, pedidoRowId: row.id, regraId: regra.id, inicioEm, fimEm, status }); produtos.add(pid) }
  }
  for (const pid of produtos) await reconciliarEstudanteProduto(svc, tenantId, estudanteId, pid, agora)
  return [...produtos]
}

/** Revoga os grants de UMA regra para UM produto num pedido. */
async function revogarGrantProduto(svc: any, pedidoRowId: string, regraId: string, produtoId: string, motivo: string): Promise<void> {
  try {
    await svc.from('simulado_access_grants').update({ status: 'revoked', revogado_em: new Date().toISOString(), motivo_revogacao: motivo, atualizado_em: new Date().toISOString() })
      .eq('pedido_id', pedidoRowId).eq('regra_id', regraId).eq('produto_id', produtoId).neq('status', 'revoked')
  } catch (e) { log(e, 'revogarGrantProduto') }
}

export interface ResumoReproc {
  dry: boolean
  pedidosAvaliados: number
  concedidos: number
  revogados: number
  semRegra: number
  novosCadastros: number
  erros: number
  amostra: { pedidoId: string; email: string | null; acao: string; produtos: number }[]
}
const resumoVazio = (dry: boolean): ResumoReproc => ({ dry, pedidosAvaliados: 0, concedidos: 0, revogados: 0, semRegra: 0, novosCadastros: 0, erros: 0, amostra: [] })
const MAX_AMOSTRA = 50

/**
 * §7.1 — Reavalia PEDIDOS PENDENTES (no_matching_rule / blocked_by_paused_rule, positivos) contra as
 * regras ATIVAS atuais e concede os que passaram a casar. Idempotente. `dry` só conta (não escreve,
 * não cria aluno). `desdeDataCompra` limita às compras a partir de uma data (usado ao RETOMAR regra).
 */
export async function reprocessarPendentes(tenantId: string, opts: { dry: boolean; desdeDataCompra?: string | null; limite?: number }): Promise<ResumoReproc> {
  const svc = createAdminClient()
  const agora = new Date()
  const r = resumoVazio(opts.dry)
  const regras = await carregarRegras(svc, tenantId)
  const ativas = regras.filter((x) => x.regra.status === 'active')
  const temPausadaQueCasa = (pedido: PedidoNormalizado) => regras.some((x) => x.regra.status === 'paused' && match(pedido, x.regra.filtros).casou)

  const rows = await fetchAll<any>(() => {
    let q = svc.from('simulado_liberacao_pedidos').select(COLS_PEDIDO)
      .eq('tenant_id', tenantId).eq('status_classificacao', 'positive')
      .in('processing_state', ['no_matching_rule', 'blocked_by_paused_rule'])
    if (opts.desdeDataCompra) q = q.gte('data_compra', opts.desdeDataCompra)
    return q.order('id', { ascending: true })
  })

  for (const row of rows) {
    r.pedidosAvaliados++
    const pedido = pedidoDaRow(row)
    const casadas = ativas.filter((x) => match(pedido, x.regra.filtros).casou)
    if (!casadas.length) {
      r.semRegra++
      if (!opts.dry) await setProcessingState(svc, row.id, temPausadaQueCasa(pedido) ? 'blocked_by_paused_rule' : 'no_matching_rule')
      continue
    }
    if (opts.dry) {
      const existe = await resolverEstudanteSemCriar(svc, tenantId, row.comprador_email, null, row.pedido_id)
      if (!existe) r.novosCadastros++
      r.concedidos++
      if (r.amostra.length < MAX_AMOSTRA) r.amostra.push({ pedidoId: row.pedido_id, email: row.comprador_email, acao: existe ? 'concederia' : 'criaria+concederia', produtos: casadas.reduce((s, c) => s + c.produtoIds.length, 0) })
      continue
    }
    const pessoa: PessoaNormalizada = { nome: row.comprador_nome ?? row.comprador_email ?? 'Aluno', email: row.comprador_email ?? null, cpf: null, telefone: row.comprador_telefone ?? null, externalId: row.pedido_id }
    const estudanteId = await resolverEstudante(svc, tenantId, row.provider as Provider, pessoa)
    if (!estudanteId) { r.erros++; continue }
    const produtos = await concederCasadas(svc, tenantId, row, estudanteId, casadas, agora)
    await setProcessingState(svc, row.id, 'granted')
    r.concedidos++
    if (r.amostra.length < MAX_AMOSTRA) r.amostra.push({ pedidoId: row.pedido_id, email: row.comprador_email, acao: 'concedido', produtos: produtos.length })
  }
  return r
}

/**
 * §7.1 item 4 — RECONCILIA os grants de uma regra EDITADA: para os pedidos que já tinham grant dela,
 * recalcula datas, revoga (motivo 'rule_changed') produtos removidos ou pedidos que deixaram de casar,
 * e (re)concede os que ficam. Depois varre os PENDENTES que passaram a casar. `dry` só conta.
 */
export async function reconciliarRegra(tenantId: string, regraId: string, opts: { dry: boolean; limite?: number }): Promise<ResumoReproc> {
  const svc = createAdminClient()
  const agora = new Date()
  const r = resumoVazio(opts.dry)
  const regras = await carregarRegras(svc, tenantId)
  const thisRule = regras.find((x) => x.regra.id === regraId)
  const produtosDaRegra = thisRule?.produtoIds ?? []

  // Grants vivos desta regra, agrupados por pedido.
  const grants = await fetchAll<{ id: string; pedido_id: string | null; estudante_id: string; produto_id: string }>(() =>
    svc.from('simulado_access_grants').select('id, pedido_id, estudante_id, produto_id').eq('tenant_id', tenantId).eq('regra_id', regraId).neq('status', 'revoked').order('id', { ascending: true }))
  const porPedido = new Map<string, { estudanteId: string; produtos: Set<string> }>()
  for (const g of grants) {
    if (!g.pedido_id) continue
    const e = porPedido.get(g.pedido_id) ?? { estudanteId: g.estudante_id, produtos: new Set<string>() }
    e.produtos.add(g.produto_id); porPedido.set(g.pedido_id, e)
  }

  if (porPedido.size) {
    const rows = await fetchAll<any>(() => svc.from('simulado_liberacao_pedidos').select(COLS_PEDIDO).in('id', [...porPedido.keys()]).order('id', { ascending: true }))
    for (const row of rows) {
      const g = porPedido.get(row.id)!
      const pedido = pedidoDaRow(row)
      const stillMatches = thisRule?.regra.status === 'active' && row.status_classificacao === 'positive' && match(pedido, thisRule.regra.filtros).casou
      const manter = stillMatches ? produtosDaRegra : []
      const afetados = new Set<string>(g.produtos)
      // revoga produtos que não valem mais nesta regra.
      for (const pid of g.produtos) {
        if (!manter.includes(pid)) { r.revogados++; if (!opts.dry) await revogarGrantProduto(svc, row.id, regraId, pid, 'rule_changed') }
      }
      // (re)concede os que ficam, com datas novas.
      if (stillMatches && !opts.dry) {
        const inicioEm = calcularInicio(thisRule!.regra.inicio, pedido.dataCompra, agora)
        const fimEm = calcularFim(thisRule!.regra.fim, pedido.dataCompra, agora)
        const status = estadoInicialGrant(inicioEm, fimEm, agora)
        for (const pid of produtosDaRegra) { await upsertGrant(svc, tenantId, { estudanteId: g.estudanteId, produtoId: pid, pedidoRowId: row.id, regraId, inicioEm, fimEm, status }); afetados.add(pid) }
      }
      if (stillMatches) r.concedidos += produtosDaRegra.length
      if (!opts.dry) for (const pid of afetados) await reconciliarEstudanteProduto(svc, tenantId, g.estudanteId, pid, agora)
      r.pedidosAvaliados++
      if (r.amostra.length < MAX_AMOSTRA) r.amostra.push({ pedidoId: row.pedido_id, email: row.comprador_email, acao: stillMatches ? 'reconciliado' : 'revogado', produtos: stillMatches ? produtosDaRegra.length : 0 })
    }
  }

  // Pendentes que passaram a casar (nova regra ou filtros ampliados).
  const extra = await reprocessarPendentes(tenantId, { dry: opts.dry, limite: opts.limite })
  r.pedidosAvaliados += extra.pedidosAvaliados; r.concedidos += extra.concedidos; r.semRegra += extra.semRegra
  r.novosCadastros += extra.novosCadastros; r.erros += extra.erros
  for (const a of extra.amostra) if (r.amostra.length < MAX_AMOSTRA) r.amostra.push(a)
  return r
}

// ── Ciclo de vida (§7.2) ────────────────────────────────────────────────────

/** PAUSAR: só impede NOVAS concessões; grants existentes permanecem (e reembolso ainda revoga). */
export async function pausarRegra(tenantId: string, regraId: string, motivo?: string): Promise<{ ok: boolean; error?: string }> {
  const svc = createAdminClient()
  try {
    await svc.from('simulado_liberacao_regras').update({ status: 'paused', paused_at: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('tenant_id', tenantId).eq('id', regraId)
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_liberacao_regras', entidadeId: regraId, tenantId, depois: { acao: 'pausar', motivo: motivo ?? null } }).catch(() => {})
    return { ok: true }
  } catch (e) { return { ok: false, error: String(e) } }
}

/**
 * RETOMAR (paused→active). Por padrão NÃO concede retroativo. `aplicarDuranteaPausa` reprocessa as
 * compras feitas DURANTE a pausa (data_compra ≥ paused_at) que ficaram bloqueadas. `dry` só simula.
 */
export async function retomarRegra(tenantId: string, regraId: string, opts: { aplicarDuranteaPausa: boolean; dry: boolean }): Promise<ResumoReproc & { ok: boolean; error?: string }> {
  const svc = createAdminClient()
  const base = resumoVazio(opts.dry)
  let pausedAt: string | null = null
  try {
    const { data } = await svc.from('simulado_liberacao_regras').select('paused_at').eq('tenant_id', tenantId).eq('id', regraId).maybeSingle()
    pausedAt = data?.paused_at ?? null
  } catch { /* ignora */ }

  if (!opts.dry) {
    try {
      await svc.from('simulado_liberacao_regras').update({ status: 'active', paused_at: null, atualizado_em: new Date().toISOString() }).eq('tenant_id', tenantId).eq('id', regraId)
      await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_liberacao_regras', entidadeId: regraId, tenantId, depois: { acao: 'retomar', aplicarDuranteaPausa: opts.aplicarDuranteaPausa } }).catch(() => {})
    } catch (e) { return { ...base, ok: false, error: String(e) } }
  }

  if (opts.aplicarDuranteaPausa) {
    const res = await reprocessarPendentes(tenantId, { dry: opts.dry, desdeDataCompra: pausedAt })
    return { ...res, ok: true }
  }
  return { ...base, ok: true }
}

/**
 * CANCELAR (terminal): revoga TODAS as concessões da regra (motivo 'rule_canceled') e reconcilia
 * (o reconciliador mantém o que OUTRA fonte ativa ainda garante). Não volta a ser ativada. `dry` só simula.
 */
export async function cancelarRegra(tenantId: string, regraId: string, opts: { dry: boolean }): Promise<ResumoReproc & { ok: boolean; error?: string }> {
  const svc = createAdminClient()
  const r = resumoVazio(opts.dry)
  const agora = new Date()
  const grants = await fetchAll<{ estudante_id: string; produto_id: string }>(() =>
    svc.from('simulado_access_grants').select('estudante_id, produto_id').eq('tenant_id', tenantId).eq('regra_id', regraId).in('status', ['active', 'scheduled']).order('estudante_id', { ascending: true }))
  const pares = [...new Set(grants.map((g) => `${g.estudante_id}|${g.produto_id}`))]
  r.revogados = grants.length
  r.pedidosAvaliados = pares.length
  if (opts.dry) {
    for (const key of pares.slice(0, MAX_AMOSTRA)) { const [est] = key.split('|'); r.amostra.push({ pedidoId: '—', email: est, acao: 'revogaria', produtos: 1 }) }
    return { ...r, ok: true }
  }
  try {
    await svc.from('simulado_access_grants').update({ status: 'revoked', revogado_em: agora.toISOString(), motivo_revogacao: 'rule_canceled', atualizado_em: agora.toISOString() }).eq('tenant_id', tenantId).eq('regra_id', regraId).in('status', ['active', 'scheduled'])
    await svc.from('simulado_liberacao_regras').update({ status: 'canceled', canceled_at: agora.toISOString(), atualizado_em: agora.toISOString() }).eq('tenant_id', tenantId).eq('id', regraId)
    for (const key of pares) { const [est, prod] = key.split('|'); await reconciliarEstudanteProduto(svc, tenantId, est, prod, agora) }
    await registrarAudit({ operacao: 'BLOQUEAR', entidade: 'simulado_liberacao_regras', entidadeId: regraId, tenantId, depois: { acao: 'cancelar', grants: grants.length } }).catch(() => {})
  } catch (e) { return { ...r, ok: false, error: String(e) } }
  return { ...r, ok: true }
}

// ── Simulador (§8) ────────────────────────────────────────────────────────────

/** DRY-RUN de um pedido avulso (real ou JSON): quais regras casam e o que seria concedido. Não escreve. */
export async function simularPedido(tenantId: string, pedido: PedidoNormalizado): Promise<ResultadoSimulacao> {
  const svc = createAdminClient()
  const regras = await carregarRegras(svc, tenantId)
  const sim: SimulacaoRegra[] = regras.map(({ regra, produtoIds }) => {
    const m = match(pedido, regra.filtros)
    return { regraId: regra.id, nome: regra.nome, status: regra.status, casou: m.casou, motivo: m.motivo, dimensoes: m.dimensoes, produtoIds }
  })
  const concederiaIds = [...new Set(sim.filter((s) => s.status === 'active' && s.casou).flatMap((s) => s.produtoIds))]
  let nomes: { id: string; nome: string }[] = []
  if (concederiaIds.length) {
    try {
      const { data } = await svc.from('simulado_produtos').select('id, nome').eq('tenant_id', tenantId).in('id', concederiaIds)
      nomes = (data ?? []).map((p: any) => ({ id: p.id, nome: p.nome }))
    } catch { nomes = concederiaIds.map((id) => ({ id, nome: id })) }
  }
  return { regras: sim, concederiaProdutos: nomes }
}
