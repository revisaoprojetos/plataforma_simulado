'use server'

import { revalidatePath } from 'next/cache'
import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { criptografar, criptografiaAtiva } from '@/lib/crypto'
import { resolverProviderCfg } from '@/lib/integracoes/config'
import { getAdapter } from '@/lib/integracoes/registry'
import { importarViaProvider, listarFontesProvider, processarEvento } from '@/lib/integracoes/orquestrador'
import { aplicarEntitlement, reaplicarLiberacoes } from '@/lib/integracoes/engine'
import { coalescer } from '@/lib/integracoes/ratelimit'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { normalizarPorMapa } from '@/lib/integracoes/normalizar-mapa'
import type { Provider, PessoaNormalizada, Entitlement } from '@/lib/integracoes/tipos'

const PROVIDERS: Provider[] = ['curseduca', 'guru']

function ehProvider(p: string): p is Provider { return (PROVIDERS as string[]).includes(p) }

async function ctx() {
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, userId: access.userId }
}

// ── Credenciais ───────────────────────────────────────────────────────────────
export interface ConfigDTO {
  provider: Provider
  ativo: boolean
  baseUrl: string
  camposPreenchidos: string[]   // quais credenciais já têm valor (sem expor o valor)
  webhookToken: string | null
  cripto: boolean               // APP_ENCRYPTION_KEY presente?
}

export async function getIntegracaoConfig(provider: string): Promise<{ ok: boolean; error?: string; config?: ConfigDTO }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_integracao_config').select('base_url, credenciais, ativo, webhook_token').eq('tenant_id', g.tenantId).eq('provider', provider).maybeSingle()
  const cred = ((data as any)?.credenciais ?? {}) as Record<string, string>
  return {
    ok: true,
    config: {
      provider, ativo: (data as any)?.ativo ?? false,
      baseUrl: (data as any)?.base_url ?? '',
      camposPreenchidos: Object.entries(cred).filter(([, v]) => !!v).map(([k]) => k),
      webhookToken: (data as any)?.webhook_token ?? null,
      cripto: criptografiaAtiva(),
    },
  }
}

export async function salvarIntegracaoConfig(provider: string, dados: { baseUrl?: string; ativo: boolean; credenciais: Record<string, string> }): Promise<{ ok: boolean; error?: string }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  // Mescla com credenciais existentes (campos vazios no form = mantém o atual).
  const { data: atual } = await svc.from('simulado_integracao_config').select('id, credenciais, webhook_token').eq('tenant_id', g.tenantId).eq('provider', provider).maybeSingle()
  const credAtual = ((atual as any)?.credenciais ?? {}) as Record<string, string>
  const credNova: Record<string, string> = { ...credAtual }
  for (const [k, v] of Object.entries(dados.credenciais)) {
    if (v && v.trim()) credNova[k] = criptografar(v.trim()) ?? '' // só sobrescreve o que veio preenchido
  }
  const webhookToken = (atual as any)?.webhook_token ?? randomBytes(24).toString('hex')

  const row = {
    tenant_id: g.tenantId, provider, base_url: dados.baseUrl?.trim() || null,
    credenciais: credNova, ativo: dados.ativo, webhook_token: webhookToken, atualizado_em: new Date().toISOString(),
  }
  const { error } = await svc.from('simulado_integracao_config').upsert(row, { onConflict: 'tenant_id,provider' })
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_integracao_config', entidadeId: g.tenantId, tenantId: g.tenantId, depois: { provider, ativo: dados.ativo } })
  revalidatePath(`/admin/integracoes/${provider}`)
  return { ok: true }
}

export async function testarIntegracao(provider: string): Promise<{ ok: boolean; error?: string }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const cfg = await resolverProviderCfg(g.tenantId, provider, { ignorarAtivo: true })
  if (!cfg) return { ok: false, error: 'Salve o API Token primeiro.' }
  const adapter = getAdapter(provider)
  if (!adapter) return { ok: false, error: `Provedor "${provider}" ainda não implementado.` }
  return adapter.testarCredenciais(cfg)
}

/** Gera um novo token de webhook (invalida a URL antiga — recadastrar na Guru). */
export async function regenerarWebhookToken(provider: string): Promise<{ ok: boolean; error?: string; token?: string }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: existe } = await svc.from('simulado_integracao_config').select('id').eq('tenant_id', g.tenantId).eq('provider', provider).maybeSingle()
  if (!existe) return { ok: false, error: 'Configure as credenciais primeiro (a URL é criada ao salvar).' }
  const novo = randomBytes(24).toString('hex')
  const { error } = await svc.from('simulado_integracao_config').update({ webhook_token: novo, atualizado_em: new Date().toISOString() }).eq('tenant_id', g.tenantId).eq('provider', provider)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_integracao_config', entidadeId: g.tenantId, tenantId: g.tenantId, depois: { provider, acao: 'regenerar_webhook_token' } })
  revalidatePath(`/admin/integracoes/${provider}`)
  return { ok: true, token: novo }
}

/** Envia um evento de TESTE (ping) para a própria URL de webhook — valida URL+token sem efeito colateral. */
export async function testarWebhookInbound(provider: string, appUrl: string): Promise<{ ok: boolean; error?: string; status?: number }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_integracao_config').select('webhook_token, ativo').eq('tenant_id', g.tenantId).eq('provider', provider).maybeSingle()
  const token = (data as any)?.webhook_token
  if (!token) return { ok: false, error: 'Salve as credenciais primeiro (gera o token da URL).' }
  const base = (appUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  try {
    const r = await fetch(`${base}/api/webhooks/${provider}/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ __test: true }) })
    const j: any = await r.json().catch(() => ({}))
    if (r.ok && j?.teste) return { ok: true, status: r.status }
    if (r.status === 403) return { ok: false, error: 'Integração está pausada — ative para receber.', status: 403 }
    return { ok: false, error: `A URL respondeu ${r.status}.`, status: r.status }
  } catch (e) { return { ok: false, error: (e as Error).message } }
}

// ── Fontes + Grupos do sistema (para import e mapeamentos) ─────────────────────
export async function listarFontes(provider: string): Promise<{ ok: boolean; error?: string; fontes?: { ref: string; nome: string; total?: number }[] }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  return listarFontesProvider(g.tenantId, provider)
}

export async function listarGruposSistema(): Promise<{ ok: boolean; grupos?: { id: string; nome: string }[] }> {
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false }
  const g = await ctx(); if (!g.ok) return { ok: false }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_grupos').select('id, nome').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome')
  return { ok: true, grupos: (data ?? []).map((s: any) => ({ id: s.id, nome: s.nome })) }
}

// ── Mapeamentos (produto/grupo → classificação/grupo/simulado) ─────────────────
export interface MapeamentoDTO { id: string; fonteRef: string; fonteNome: string | null; classificacao: string | null; grupoId: string | null; pastaId: string | null; simuladoId: string | null; ativo: boolean }

export async function listarMapeamentos(provider: string): Promise<{ ok: boolean; error?: string; mapeamentos?: MapeamentoDTO[] }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const ler = (cols: string) => svc.from('simulado_integracao_mapeamentos').select(cols).eq('tenant_id', g.tenantId).eq('provider', provider).order('fonte_nome')
  let r = await ler('id, fonte_ref, fonte_nome, classificacao, grupo_id, pasta_id, simulado_id, ativo')
  if (r.error && /pasta_id/i.test(r.error.message)) r = await ler('id, fonte_ref, fonte_nome, classificacao, grupo_id, simulado_id, ativo')
  return { ok: true, mapeamentos: ((r.data as any[]) ?? []).map((m: any) => ({ id: m.id, fonteRef: m.fonte_ref, fonteNome: m.fonte_nome, classificacao: m.classificacao, grupoId: m.grupo_id, pastaId: m.pasta_id ?? null, simuladoId: m.simulado_id, ativo: m.ativo })) }
}

export async function salvarMapeamento(provider: string, m: { id?: string; fonteRef: string; fonteNome?: string; classificacao?: string | null; grupoId?: string | null; pastaId?: string | null; simuladoId?: string | null; ativo?: boolean }): Promise<{ ok: boolean; error?: string }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  if (!m.fonteRef) return { ok: false, error: 'Selecione o produto/grupo de origem.' }
  const svc = createAdminClient()
  // Validação de direcionamento: grupo/banco/simulado precisam existir e ser do MESMO tenant.
  if (m.grupoId) {
    const { data } = await svc.from('simulado_grupos').select('id, is_mestre').eq('id', m.grupoId).eq('tenant_id', g.tenantId).eq('deletado', false).maybeSingle()
    if (!data) return { ok: false, error: 'Grupo inválido ou de outra plataforma.' }
    if ((data as any).is_mestre) return { ok: false, error: 'O destino de "Grupo" deve ser um grupo (não uma pasta).' }
  }
  if (m.pastaId) {
    const { data } = await svc.from('simulado_pastas').select('id').eq('id', m.pastaId).eq('tenant_id', g.tenantId).maybeSingle()
    if (!data) return { ok: false, error: 'Banco inválido ou de outra plataforma.' }
  }
  if (m.simuladoId) {
    const { data } = await svc.from('simulado_simulados').select('id').eq('id', m.simuladoId).eq('tenant_id', g.tenantId).eq('deletado', false).maybeSingle()
    if (!data) return { ok: false, error: 'Simulado inválido ou de outra plataforma.' }
  }
  const row: any = {
    tenant_id: g.tenantId, provider, fonte_ref: m.fonteRef, fonte_nome: m.fonteNome ?? null,
    classificacao: m.classificacao ?? null, grupo_id: m.grupoId ?? null, pasta_id: m.pastaId ?? null, simulado_id: m.simuladoId ?? null,
    ativo: m.ativo ?? true, atualizado_em: new Date().toISOString(),
  }
  let { error } = await svc.from('simulado_integracao_mapeamentos').upsert(row, { onConflict: 'tenant_id,provider,fonte_ref' })
  if (error && /pasta_id/i.test(error.message)) { delete row.pasta_id; ({ error } = await svc.from('simulado_integracao_mapeamentos').upsert(row, { onConflict: 'tenant_id,provider,fonte_ref' })) }
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/integracoes/${provider}`)
  return { ok: true }
}

export async function excluirMapeamento(provider: string, id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_integracao_mapeamentos').delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/integracoes/${provider}`)
  return { ok: true }
}

// ── Eventos (monitor dos webhooks recebidos) ──────────────────────────────────
export interface EventoDTO {
  id: string; eventId: string; tipo: string | null; status: string
  comprador: string | null; produto: string | null
  recebidoEm: string; processadoEm: string | null; erro: string | null
}

/** Extrai comprador/produto do payload cru (best-effort, formato Guru). */
function resumoEvento(payload: any): { comprador: string | null; produto: string | null } {
  const c = payload?.contact ?? payload?.buyer ?? {}
  const p = payload?.product ?? {}
  return {
    comprador: c.email ?? c.name ?? c.doc ?? null,
    produto: p.name ?? p.marketplace_id ?? payload?.checkout_url ?? null,
  }
}

export async function listarEventos(provider: string, limite = 50): Promise<{ ok: boolean; error?: string; eventos?: EventoDTO[] }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_integracao_eventos')
    .select('id, event_id, tipo, status, payload, recebido_em, processado_em, erro')
    .eq('tenant_id', g.tenantId).eq('provider', provider)
    .order('recebido_em', { ascending: false }).limit(limite)
  const eventos: EventoDTO[] = (data ?? []).map((e: any) => {
    const r = resumoEvento(e.payload)
    return { id: e.id, eventId: e.event_id, tipo: e.tipo, status: e.status, comprador: r.comprador, produto: r.produto, recebidoEm: e.recebido_em, processadoEm: e.processado_em, erro: e.erro }
  })
  return { ok: true, eventos }
}

export interface EventoDetalhe {
  eventId: string; tipo: string | null; status: string; erro: string | null
  recebidoEm: string; processadoEm: string | null
  headers: unknown; query: unknown; body: unknown
}

/** Detalhe COMPLETO de um evento (headers + body cru) — para o pop-up de visualização. */
export async function getEventoDetalhe(provider: string, id: string): Promise<{ ok: boolean; error?: string; detalhe?: EventoDetalhe }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  // headers pode não existir (migration pendente) → busca tolerante.
  let data: any
  const r = await svc.from('simulado_integracao_eventos').select('event_id, tipo, status, erro, recebido_em, processado_em, payload, headers').eq('id', id).eq('tenant_id', g.tenantId).eq('provider', provider).maybeSingle()
  if (r.error && /headers|column/i.test(r.error.message)) {
    const r2 = await svc.from('simulado_integracao_eventos').select('event_id, tipo, status, erro, recebido_em, processado_em, payload').eq('id', id).eq('tenant_id', g.tenantId).eq('provider', provider).maybeSingle()
    data = r2.data
  } else data = r.data
  if (!data) return { ok: false, error: 'Evento não encontrado.' }
  const h = (data.headers ?? {}) as any
  return {
    ok: true,
    detalhe: {
      eventId: data.event_id, tipo: data.tipo, status: data.status, erro: data.erro,
      recebidoEm: data.recebido_em, processadoEm: data.processado_em,
      headers: h.headers ?? null, query: h.query ?? null, body: data.payload,
    },
  }
}

// ── Reprocessar liberações (recuperação de erro) ──────────────────────────────
export async function reprocessarLiberacoes(provider: string, soProduto?: string): Promise<{ ok: boolean; error?: string; resumo?: Awaited<ReturnType<typeof reaplicarLiberacoes>> }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  try {
    const resumo = await reaplicarLiberacoes(g.tenantId, provider, soProduto || undefined)
    revalidatePath('/admin/estudantes')
    return { ok: true, resumo }
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? 'Falha ao reprocessar.' }
  }
}

// ── Reconciliação automática (Curseduca) — agendada pelo cron curseduca-sync ───
export interface ReconciliacaoDTO {
  ativo: boolean; intervaloMin: number; grupos: number[]; sincronizar: boolean
  ultimaExecucao: string | null; ultimoResultado: any | null
}

export async function getReconciliacao(): Promise<{ ok: boolean; error?: string; dados?: ReconciliacaoDTO }> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_curseduca_sync').select('ativo, intervalo_min, grupos, sincronizar, ultima_execucao, ultimo_resultado').eq('tenant_id', g.tenantId).order('criado_em', { ascending: false }).limit(1).maybeSingle()
  const d = data as any
  return {
    ok: true,
    dados: d
      ? { ativo: !!d.ativo, intervaloMin: d.intervalo_min ?? 360, grupos: (d.grupos ?? []).map(Number), sincronizar: !!d.sincronizar, ultimaExecucao: d.ultima_execucao ?? null, ultimoResultado: d.ultimo_resultado ?? null }
      : { ativo: false, intervaloMin: 360, grupos: [], sincronizar: true, ultimaExecucao: null, ultimoResultado: null },
  }
}

export async function salvarReconciliacao(cfg: { ativo: boolean; intervaloMin: number; grupos: number[]; sincronizar: boolean }): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const grupos = (cfg.grupos ?? []).map(Number).filter((n) => Number.isFinite(n))
  const intervaloMin = Math.max(15, Math.round(cfg.intervaloMin || 360)) // mínimo 15 min
  if (cfg.ativo && !grupos.length) return { ok: false, error: 'Selecione ao menos um grupo para reconciliar.' }
  const svc = createAdminClient()
  const { data: existente } = await svc.from('simulado_curseduca_sync').select('id').eq('tenant_id', g.tenantId).order('criado_em', { ascending: false }).limit(1).maybeSingle()
  const linha = { grupos, destino: { tipo: 'nenhum' }, sincronizar: !!cfg.sincronizar, intervalo_min: intervaloMin, ativo: !!cfg.ativo, atualizado_em: new Date().toISOString() }
  const r = (existente as any)?.id
    ? await svc.from('simulado_curseduca_sync').update(linha).eq('id', (existente as any).id)
    : await svc.from('simulado_curseduca_sync').insert({ tenant_id: g.tenantId, tipo: 'import', criado_por: g.userId ?? null, ...linha })
  if (r.error) return { ok: false, error: r.error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_curseduca_sync', entidadeId: g.tenantId, tenantId: g.tenantId, depois: { ativo: cfg.ativo, intervaloMin, grupos: grupos.length, sincronizar: cfg.sincronizar } }).catch(() => {})
  revalidatePath('/admin/integracoes/curseduca')
  return { ok: true }
}

export async function rodarReconciliacaoAgora(): Promise<{ ok: boolean; error?: string; resultado?: any }> {
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_curseduca_sync').select('id, grupos, sincronizar').eq('tenant_id', g.tenantId).order('criado_em', { ascending: false }).limit(1).maybeSingle()
  const d = data as any
  const grupos = (d?.grupos ?? []).map(Number).filter((n: number) => Number.isFinite(n))
  if (!grupos.length) return { ok: false, error: 'Configure e salve os grupos primeiro.' }
  const { resolverCfg, executarImport } = await import('@/lib/curseduca/import-core')
  const curCfg = await resolverCfg(g.tenantId)
  if (!curCfg) return { ok: false, error: 'Credenciais Curseduca não configuradas/ativas.' }
  try {
    const resultado = await executarImport({ tenantId: g.tenantId, cfg: curCfg }, grupos, { tipo: 'nenhum' }, !!d?.sincronizar, Number.MAX_SAFE_INTEGER)
    if (d?.id) await svc.from('simulado_curseduca_sync').update({ ultima_execucao: new Date().toISOString(), ultimo_resultado: resultado }).eq('id', d.id)
    revalidatePath('/admin/estudantes')
    return { ok: true, resultado }
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? 'Falha na reconciliação.' }
  }
}

// ── Mapa dinâmico do JSON (webhook) ────────────────────────────────────────────
export interface MapaConfigDTO {
  mapa: Record<string, string>
  ultimoPayload: unknown | null   // último corpo recebido (para pré-visualizar/preencher)
}

export async function getMapaConfig(provider: string): Promise<{ ok: boolean; error?: string; dados?: MapaConfigDTO }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  let mapa: Record<string, string> = {}
  const rc = await svc.from('simulado_integracao_config').select('mapa_json').eq('tenant_id', g.tenantId).eq('provider', provider).maybeSingle()
  if (!rc.error && (rc.data as any)?.mapa_json && typeof (rc.data as any).mapa_json === 'object') mapa = (rc.data as any).mapa_json

  // Último payload JSON recebido (para o admin ver as chaves reais e mapear).
  let ultimoPayload: unknown | null = null
  const rp = await svc.from('simulado_webhook_inbox').select('body_json').eq('tenant_id', g.tenantId).eq('provider', provider).not('body_json', 'is', null).order('recebido_em', { ascending: false }).limit(1).maybeSingle()
  if (!rp.error && (rp.data as any)?.body_json) ultimoPayload = (rp.data as any).body_json

  return { ok: true, dados: { mapa, ultimoPayload } }
}

export async function salvarMapaConfig(provider: string, mapa: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  // Só grava caminhos não vazios (limpa strings em branco).
  const limpo: Record<string, string> = {}
  for (const [k, v] of Object.entries(mapa || {})) { const s = (v ?? '').trim(); if (s) limpo[k] = s }
  const { error } = await svc.from('simulado_integracao_config').update({ mapa_json: limpo, atualizado_em: new Date().toISOString() }).eq('tenant_id', g.tenantId).eq('provider', provider)
  if (error) {
    if (/mapa_json|column|schema cache/i.test(error.message)) return { ok: false, error: 'Aplique a migration 20260717000004_integracao_mapa_json.' }
    return { ok: false, error: error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_integracao_config', entidadeId: g.tenantId, tenantId: g.tenantId, depois: { provider, mapa_json: limpo } }).catch(() => {})
  revalidatePath(`/admin/integracoes/${provider}`)
  return { ok: true }
}

// ── Processar recebidos (aplica os dados do inbox no sistema via mapa + engine) ─
async function aplicarPayloadNoSistema(tenantId: string, provider: Provider, payload: unknown): Promise<{ ok: boolean; acao?: string; motivo?: string; error?: string; comprador?: string | null }> {
  const { normalizarPorMapa } = await import('@/lib/integracoes/normalizar-mapa')
  const cfg = await resolverProviderCfg(tenantId, provider, { ignorarAtivo: true })
  const norm = normalizarPorMapa(payload, cfg?.mapa, true) // manual: status desconhecido = concede
  if (!norm) return { ok: false, error: 'Payload sem pessoa/produto reconhecíveis — ajuste o Mapa JSON.' }
  const r = await aplicarEntitlement({ tenantId, provider, pessoa: norm.pessoa, entitlement: norm.entitlement })
  return { ok: r.ok, acao: r.acao, motivo: r.motivo, error: r.error, comprador: norm.pessoa.email ?? norm.pessoa.nome }
}

export async function processarRecebido(provider: string, inboxId: string): Promise<{ ok: boolean; error?: string; acao?: string; motivo?: string }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_webhook_inbox').select('body_json').eq('id', inboxId).eq('tenant_id', g.tenantId).eq('provider', provider).maybeSingle()
  if (!data || (data as any).body_json == null) return { ok: false, error: 'Requisição sem corpo JSON para processar.' }
  const r = await aplicarPayloadNoSistema(g.tenantId, provider, (data as any).body_json)
  if (!r.ok) return { ok: false, error: r.error ?? 'Falha ao aplicar.' }
  await svc.from('simulado_webhook_inbox').update({ resultado: `processado manual: ${r.acao}${r.motivo ? ` (${r.motivo})` : ''}` }).eq('id', inboxId)
  revalidatePath('/admin/estudantes')
  return { ok: true, acao: r.acao, motivo: r.motivo }
}

export async function processarRecebidosTodos(provider: string, limite = 300): Promise<{ ok: boolean; error?: string; resumo?: { total: number; concedidos: number; ignorados: number; erros: number } }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_webhook_inbox').select('id, body_json').eq('tenant_id', g.tenantId).eq('provider', provider).eq('metodo', 'POST').not('body_json', 'is', null).order('recebido_em', { ascending: false }).limit(limite)
  const linhas = (data ?? []) as any[]
  let concedidos = 0, ignorados = 0, erros = 0
  const vistos = new Set<string>()
  for (const l of linhas) {
    try {
      const chave = JSON.stringify(l.body_json)
      if (vistos.has(chave)) continue; vistos.add(chave) // dedupe payloads idênticos
      const r = await aplicarPayloadNoSistema(g.tenantId, provider, l.body_json)
      if (!r.ok) { erros++; continue }
      if (r.acao === 'concedido') concedidos++; else ignorados++
    } catch { erros++ }
  }
  revalidatePath('/admin/estudantes')
  return { ok: true, resumo: { total: linhas.length, concedidos, ignorados, erros } }
}

// ── Inbox CRU do webhook (toda requisição que bate na URL) ─────────────────────
export interface InboxDTO {
  id: string; metodo: string; statusResp: number | null; resultado: string | null
  comprador: string | null; produto: string | null; ip: string | null; recebidoEm: string
}

export async function listarWebhookInbox(provider: string, limite = 100): Promise<{ ok: boolean; error?: string; itens?: InboxDTO[]; semTabela?: boolean }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_webhook_inbox')
    .select('id, metodo, status_resp, resultado, body_json, ip, recebido_em')
    .eq('tenant_id', g.tenantId).eq('provider', provider)
    .order('recebido_em', { ascending: false }).limit(limite)
  if (error) {
    if ((error as any).code === '42P01' || /does not exist|schema cache/i.test(error.message)) return { ok: true, itens: [], semTabela: true }
    return { ok: false, error: error.message }
  }
  const itens: InboxDTO[] = (data ?? []).map((e: any) => {
    const r = resumoEvento(e.body_json)
    return { id: e.id, metodo: e.metodo, statusResp: e.status_resp, resultado: e.resultado, comprador: r.comprador, produto: r.produto, ip: e.ip, recebidoEm: e.recebido_em }
  })
  return { ok: true, itens }
}

// Inbox UNIFICADO (multi-fonte): todas as requisições do tenant, de qualquer fonte.
export interface RecebidoDTO {
  id: string; provider: string; fonte: string | null; metodo: string
  statusResp: number | null; resultado: string | null
  comprador: string | null; produto: string | null; ip: string | null; recebidoEm: string
}

export async function listarRecebidos(filtroFonte?: string, limite = 200): Promise<{ ok: boolean; error?: string; itens?: RecebidoDTO[]; fontes?: string[]; semTabela?: boolean }> {
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const cols = 'id, provider, fonte, metodo, status_resp, resultado, body_json, ip, recebido_em'
  let res = await svc.from('simulado_webhook_inbox').select(cols).eq('tenant_id', g.tenantId).order('recebido_em', { ascending: false }).limit(limite)
  // Coluna `fonte` pode não existir ainda → tenta sem ela.
  if (res.error && /fonte|column/i.test(res.error.message)) {
    res = await svc.from('simulado_webhook_inbox').select('id, provider, metodo, status_resp, resultado, body_json, ip, recebido_em').eq('tenant_id', g.tenantId).order('recebido_em', { ascending: false }).limit(limite) as any
  }
  if (res.error) {
    if ((res.error as any).code === '42P01' || /does not exist|schema cache/i.test(res.error.message)) return { ok: true, itens: [], fontes: [], semTabela: true }
    return { ok: false, error: res.error.message }
  }
  const linhas = (res.data ?? []) as any[]
  const fontes = [...new Set(linhas.map((e) => e.fonte ?? e.provider).filter(Boolean))].sort()
  const filtradas = filtroFonte ? linhas.filter((e) => (e.fonte ?? e.provider) === filtroFonte) : linhas
  const itens: RecebidoDTO[] = filtradas.map((e) => {
    const r = resumoEvento(e.body_json)
    return { id: e.id, provider: e.provider, fonte: e.fonte ?? e.provider, metodo: e.metodo, statusResp: e.status_resp, resultado: e.resultado, comprador: r.comprador, produto: r.produto, ip: e.ip, recebidoEm: e.recebido_em }
  })
  return { ok: true, itens, fontes }
}

export async function getRecebidoDetalhe(id: string): Promise<{ ok: boolean; error?: string; detalhe?: InboxDetalhe & { fonte: string | null; provider: string } }> {
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  let res = await svc.from('simulado_webhook_inbox').select('provider, fonte, metodo, status_resp, resultado, ip, recebido_em, token, headers, query, body_json, body_raw').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  if (res.error && /fonte|column/i.test(res.error.message)) {
    res = await svc.from('simulado_webhook_inbox').select('provider, metodo, status_resp, resultado, ip, recebido_em, token, headers, query, body_json, body_raw').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle() as any
  }
  const d = res.data as any
  if (!d) return { ok: false, error: 'Requisição não encontrada.' }
  const tok: string | null = d.token ?? null
  return {
    ok: true,
    detalhe: {
      provider: d.provider, fonte: d.fonte ?? d.provider,
      metodo: d.metodo, statusResp: d.status_resp, resultado: d.resultado, ip: d.ip, recebidoEm: d.recebido_em,
      tokenMasc: tok ? `${tok.slice(0, 6)}…${tok.slice(-4)}` : null,
      headers: d.headers ?? null, query: d.query ?? null, body: d.body_json ?? null, bodyRaw: d.body_raw ?? null,
    },
  }
}

export interface InboxDetalhe {
  metodo: string; statusResp: number | null; resultado: string | null
  ip: string | null; recebidoEm: string; tokenMasc: string | null
  headers: unknown; query: unknown; body: unknown; bodyRaw: string | null
  resumo?: string[]
}

/** Resumo humano do que a requisição faz/fez (read-only): comprador, produto, aluno, grupos, mapeamento. */
async function montarResumoRecebido(svc: ReturnType<typeof createAdminClient>, tenantId: string, provider: Provider, payload: unknown): Promise<string[]> {
  try {
    const cfg = await resolverProviderCfg(tenantId, provider)
    const norm = normalizarPorMapa(payload, cfg?.mapa, true)
    if (!norm) return ['Não deu para identificar comprador/produto neste payload — revise o Mapa JSON.']
    const { pessoa, entitlement, statusBruto } = norm
    const dig = (s?: string | null) => (s ? s.replace(/\D/g, '') : '')
    const out: string[] = []
    out.push(`Comprador: ${pessoa.nome}${pessoa.email ? ` · ${pessoa.email}` : ''}${pessoa.cpf ? ` · CPF ${dig(pessoa.cpf)}` : ''}`)
    out.push(`Produto: ${entitlement.produtoNome ?? entitlement.produtoRef} · status "${statusBruto ?? '—'}" → ${entitlement.status === 'ativo' ? 'LIBERA acesso' : 'CANCELA acesso'}`)

    let est: any = null
    for (const [col, val] of [['matricula_externa', pessoa.externalId], ['email', pessoa.email?.trim().toLowerCase()], ['cpf', dig(pessoa.cpf)]] as [string, string | undefined][]) {
      if (est || !val) continue
      const { data } = await svc.from('simulado_estudantes').select('id, classificacao').eq('tenant_id', tenantId).eq(col, val).eq('deletado', false).maybeSingle()
      if (data) est = data
    }
    if (est) {
      out.push(`Aluno já cadastrado${est.classificacao ? ` · classificação: ${est.classificacao}` : ''}.`)
      const { data: gm } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', est.id)
      const gids = (gm ?? []).map((x: any) => x.grupo_id)
      if (gids.length) { const { data: gs } = await svc.from('simulado_grupos').select('nome').in('id', gids); out.push(`Está nos grupos: ${(gs ?? []).map((x: any) => x.nome).join(', ')}.`) }
      const { count } = await svc.from('simulado_matriculas').select('id', { count: 'exact', head: true }).eq('estudante_id', est.id)
      out.push(`Matriculado em ${count ?? 0} simulado(s).`)
      if (est.classificacao === 'passaporte') out.push('É PASSAPORTE → acessa TODOS os simulados automaticamente.')
    } else {
      out.push('Aluno ainda não existe — será cadastrado ao processar.')
    }

    const { data: mp } = await svc.from('simulado_integracao_mapeamentos').select('classificacao, grupo_id, pasta_id, simulado_id, ativo').eq('tenant_id', tenantId).eq('provider', provider).eq('fonte_ref', entitlement.produtoRef).maybeSingle()
    if (mp && (mp as any).ativo) {
      const m = mp as any
      const partes: string[] = []
      if (m.classificacao) partes.push(`classificação ${m.classificacao}`)
      if (m.grupo_id) { const { data } = await svc.from('simulado_grupos').select('nome').eq('id', m.grupo_id).maybeSingle(); partes.push(`grupo "${(data as any)?.nome ?? '?'}"`) }
      if (m.pasta_id) { const { data } = await svc.from('simulado_pastas').select('nome').eq('id', m.pasta_id).maybeSingle(); partes.push(`banco "${(data as any)?.nome ?? '?'}" (libera os simulados dele)`) }
      if (m.simulado_id) { const { data } = await svc.from('simulado_simulados').select('titulo').eq('id', m.simulado_id).maybeSingle(); partes.push(`simulado "${(data as any)?.titulo ?? '?'}"`) }
      out.push(`Mapeamento concede: ${partes.length ? partes.join(' · ') : '(nada configurado)'}.`)
    } else {
      out.push('Produto SEM mapeamento → ao processar cai num grupo automático (configure em Mapeamentos).')
    }
    return out
  } catch (e: any) { return ['Não foi possível montar o resumo: ' + (e?.message ?? String(e))] }
}

export async function getWebhookInboxDetalhe(provider: string, id: string): Promise<{ ok: boolean; error?: string; detalhe?: InboxDetalhe }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_webhook_inbox')
    .select('metodo, status_resp, resultado, ip, recebido_em, token, headers, query, body_json, body_raw')
    .eq('id', id).eq('tenant_id', g.tenantId).eq('provider', provider).maybeSingle()
  if (!data) return { ok: false, error: 'Requisição não encontrada.' }
  const d = data as any
  const tok: string | null = d.token ?? null
  const resumo = d.body_json ? await montarResumoRecebido(svc, g.tenantId, provider as Provider, d.body_json) : undefined
  return {
    ok: true,
    detalhe: {
      metodo: d.metodo, statusResp: d.status_resp, resultado: d.resultado, ip: d.ip, recebidoEm: d.recebido_em,
      tokenMasc: tok ? `${tok.slice(0, 6)}…${tok.slice(-4)}` : null,
      headers: d.headers ?? null, query: d.query ?? null, body: d.body_json ?? null, bodyRaw: d.body_raw ?? null,
      resumo,
    },
  }
}

export async function reprocessarEvento(provider: string, id: string): Promise<{ ok: boolean; error?: string }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: ev } = await svc.from('simulado_integracao_eventos').select('payload').eq('id', id).eq('tenant_id', g.tenantId).eq('provider', provider).maybeSingle()
  if (!ev) return { ok: false, error: 'Evento não encontrado.' }
  const adapter = getAdapter(provider)
  const evento = adapter?.parseWebhook ? await adapter.parseWebhook((ev as any).payload, {}, { provider, baseUrl: '', credenciais: {} }) : null
  if (!evento) { await svc.from('simulado_integracao_eventos').update({ status: 'ignorado', processado_em: new Date().toISOString() }).eq('id', id); return { ok: true } }
  const r = await processarEvento(g.tenantId, provider, evento)
  await svc.from('simulado_integracao_eventos').update({ status: r.ok ? 'processado' : 'erro', erro: r.error ?? null, processado_em: new Date().toISOString() }).eq('id', id)
  revalidatePath(`/admin/integracoes/${provider}`)
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}

// ── Import (ação explícita do admin) ───────────────────────────────────────────
// ── Assinaturas (Guru): análise + confirmar/adicionar ─────────────────────────
export interface AssinaturaGuruDTO {
  pessoaExternalId: string
  entExternalId: string
  nome: string
  email: string | null
  cpf: string | null
  telefone: string | null
  produtoRef: string
  produtoNome: string | null
  status: string
  jaNoSistema: boolean
  temMapeamento: boolean
}

const chaveDigitos = (s?: string | null) => (s ? s.replace(/\D/g, '') : '')

interface BaseRow {
  pessoa_external_id: string | null; ent_external_id: string
  nome: string | null; email: string | null; cpf: string | null; telefone: string | null
  produto_ref: string | null; produto_nome: string | null; status: string | null
}

export interface AssinaturasResult {
  ok: boolean; error?: string
  itens?: AssinaturaGuruDTO[]
  sincronizadoEm?: string | null   // ISO da última sincronização (base_sync_em)
  total?: number
  nuncaSync?: boolean              // base vazia e nunca sincronizada → sugerir "Sincronizar"
}

/**
 * Lê as assinaturas JÁ SALVAS na base local (simulado_integracao_base) — rápido e SEM tocar
 * a API do provedor. A API só é chamada por `sincronizarAssinaturas()` (botão "Sincronizar").
 * Assim o uso do dia a dia (abrir a tela, comparar, adicionar) NÃO sobrecarrega a chave/rate
 * limit. Enriquece com "já está no sistema?" e "produto mapeado?".
 */
export async function listarAssinaturasSalvas(provider: string): Promise<AssinaturasResult> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:view')) && !(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()

  const { data: cfgRow } = await svc.from('simulado_integracao_config').select('base_sync_em').eq('tenant_id', g.tenantId).eq('provider', provider).maybeSingle()
  const sincronizadoEm = (cfgRow as any)?.base_sync_em ?? null

  // Lê a base salva (paginada; sem teto de 1000). Se a tabela ainda não existe → orienta a migration.
  let linhas: BaseRow[]
  try {
    linhas = await fetchAll<BaseRow>(() =>
      svc.from('simulado_integracao_base')
        .select('pessoa_external_id, ent_external_id, nome, email, cpf, telefone, produto_ref, produto_nome, status')
        .eq('tenant_id', g.tenantId).eq('provider', provider)
        .order('status', { ascending: true }).order('nome', { ascending: true }))
  } catch (e) {
    if ((e as any)?.code === '42P01') return { ok: false, error: 'A base ainda não foi criada. Aplique a migration 20260717000001_integracao_base.' }
    return { ok: false, error: (e as Error).message ?? 'Falha ao ler a base.' }
  }
  if (!linhas.length) return { ok: true, itens: [], sincronizadoEm, total: 0, nuncaSync: !sincronizadoEm }

  // Mapeamentos ativos (para marcar "produto mapeado?").
  const { data: maps } = await svc.from('simulado_integracao_mapeamentos').select('fonte_ref').eq('tenant_id', g.tenantId).eq('provider', provider).eq('ativo', true)
  const mapeados = new Set((maps ?? []).map((m: any) => m.fonte_ref))

  // "Já no sistema?" em lote: casa por email e por cpf (uma consulta chunk'd cada).
  const emails = [...new Set(linhas.map((r) => (r.email ?? '').trim().toLowerCase()).filter(Boolean))]
  const cpfs = [...new Set(linhas.map((r) => chaveDigitos(r.cpf)).filter(Boolean))]
  const porEmail = emails.length ? await fetchAllByIn<{ email: string }>(emails, (c) => svc.from('simulado_estudantes').select('email').eq('tenant_id', g.tenantId).eq('deletado', false).in('email', c)) : []
  const porCpf = cpfs.length ? await fetchAllByIn<{ cpf: string }>(cpfs, (c) => svc.from('simulado_estudantes').select('cpf').eq('tenant_id', g.tenantId).eq('deletado', false).in('cpf', c)) : []
  const emailSet = new Set(porEmail.map((e) => (e.email ?? '').trim().toLowerCase()))
  const cpfSet = new Set(porCpf.map((e) => chaveDigitos(e.cpf)))

  const itens: AssinaturaGuruDTO[] = linhas.map((r) => {
    const email = (r.email ?? '').trim().toLowerCase() || null
    const cpf = chaveDigitos(r.cpf) || null
    return {
      pessoaExternalId: r.pessoa_external_id ?? r.ent_external_id,
      entExternalId: r.ent_external_id,
      nome: r.nome ?? email ?? 'Aluno', email: r.email, cpf: r.cpf, telefone: r.telefone,
      produtoRef: r.produto_ref ?? '', produtoNome: r.produto_nome, status: r.status ?? 'ativo',
      jaNoSistema: (!!email && emailSet.has(email)) || (!!cpf && cpfSet.has(cpf)),
      temMapeamento: !!r.produto_ref && mapeados.has(r.produto_ref),
    }
  })
  return { ok: true, itens, sincronizadoEm, total: itens.length, nuncaSync: !sincronizadoEm }
}

/**
 * SINCRONIZA da API do provedor → base local (upsert idempotente por tenant+provider+external_id).
 * Esta é a ÚNICA função que toca a API. Coalescida (single-flight) p/ dois admins clicando junto
 * não puxarem em dobro; o rate limit interno do adapter respeita o limite da API. Grava
 * base_sync_em/total em simulado_integracao_config p/ exibir "última sincronização".
 */
export async function sincronizarAssinaturas(provider: string): Promise<{ ok: boolean; error?: string; total?: number; sincronizadoEm?: string }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  const cfg = await resolverProviderCfg(g.tenantId, provider, { ignorarAtivo: true })
  if (!cfg) return { ok: false, error: 'Salve o API Token primeiro.' }
  const adapter = getAdapter(provider)
  if (!adapter) return { ok: false, error: 'Provedor não suportado.' }
  const svc = createAdminClient()

  try {
    const pares = await coalescer(`${provider}:sync:${g.tenantId}`, () => adapter.listarPessoas(cfg, []))
    const agora = new Date().toISOString()
    const rows = pares.map((p) => ({
      tenant_id: g.tenantId, provider,
      ent_external_id: p.entitlement.externalId,
      pessoa_external_id: p.pessoa.externalId,
      nome: p.pessoa.nome,
      email: (p.pessoa.email ?? '').trim().toLowerCase() || null,
      cpf: chaveDigitos(p.pessoa.cpf) || null,
      telefone: p.pessoa.telefone ?? null,
      produto_ref: p.entitlement.produtoRef,
      produto_nome: p.entitlement.produtoNome ?? null,
      status: p.entitlement.status,
      inicio_em: p.entitlement.inicioEm ?? null,
      expira_em: p.entitlement.expiraEm ?? null,
      bruto: p as any,
      sincronizado_em: agora,
    }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await svc.from('simulado_integracao_base').upsert(rows.slice(i, i + 500), { onConflict: 'tenant_id,provider,ent_external_id' })
      if (error) {
        if ((error as any).code === '42P01') return { ok: false, error: 'A base ainda não foi criada. Aplique a migration 20260717000001_integracao_base.' }
        return { ok: false, error: (error as any).message ?? 'Falha ao gravar na base.' }
      }
    }
    await svc.from('simulado_integracao_config').update({ base_sync_em: agora, base_sync_total: rows.length }).eq('tenant_id', g.tenantId).eq('provider', provider)
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_integracao_base', entidadeId: g.tenantId, tenantId: g.tenantId, depois: { provider, total: rows.length } }).catch(() => {})
    revalidatePath(`/admin/integracoes/${provider}`)
    return { ok: true, total: rows.length, sincronizadoEm: agora }
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? 'Falha ao sincronizar.' }
  }
}

/**
 * Confirma e adiciona ao sistema as assinaturas selecionadas (cria/atualiza o estudante,
 * registra a assinatura e concede acesso pelo mapeamento do produto). Idempotente.
 */
export async function aplicarAssinaturasGuru(provider: string, itens: AssinaturaGuruDTO[]): Promise<{ ok: boolean; error?: string; resumo?: { total: number; concedidos: number; criados: number; semMapeamento: number; erros: number } }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  if (!itens?.length) return { ok: false, error: 'Nada selecionado.' }

  let concedidos = 0, semMapeamento = 0, erros = 0
  const estudantes = new Set<string>()
  for (const it of itens) {
    const pessoa: PessoaNormalizada = { nome: it.nome, email: it.email, cpf: it.cpf, telefone: it.telefone, externalId: it.pessoaExternalId }
    const entitlement: Entitlement = { externalId: it.entExternalId, produtoRef: it.produtoRef, produtoNome: it.produtoNome, status: (it.status as any) ?? 'ativo' }
    try {
      const r = await aplicarEntitlement({ tenantId: g.tenantId, provider, pessoa, entitlement })
      if (!r.ok) { erros++; continue }
      if (r.estudanteId) estudantes.add(r.estudanteId)
      if (r.acao === 'concedido') concedidos++
      if (r.acao === 'ignorado' && r.motivo?.includes('mapeamento')) semMapeamento++
    } catch { erros++ }
  }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_assinaturas', entidadeId: g.tenantId, tenantId: g.tenantId, depois: { provider, selecionadas: itens.length, concedidos, semMapeamento, erros } }).catch(() => {})
  revalidatePath('/admin/estudantes')
  return { ok: true, resumo: { total: itens.length, concedidos, criados: estudantes.size, semMapeamento, erros } }
}

export async function rodarImportIntegracao(provider: string, refs: string[]): Promise<{ ok: boolean; error?: string; resumo?: { total: number; concedidos: number; revogados: number; ignorados: number; erros: number } }> {
  if (!ehProvider(provider)) return { ok: false, error: 'Provedor inválido.' }
  if (!(await checkPermission('estudantes:create'))) return { ok: false, error: 'Sem permissão.' }
  const g = await ctx(); if (!g.ok) return { ok: false, error: g.error }
  if (!refs?.length) return { ok: false, error: 'Selecione ao menos uma fonte para importar.' }
  const r = await importarViaProvider(g.tenantId, provider, refs)
  if (!r.ok) return { ok: false, error: r.error }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_integracao_jobs', entidadeId: g.tenantId, tenantId: g.tenantId, depois: { provider, refs: refs.length, ...r } })
  revalidatePath('/admin/estudantes')
  return { ok: true, resumo: { total: r.total ?? 0, concedidos: r.concedidos ?? 0, revogados: r.revogados ?? 0, ignorados: r.ignorados ?? 0, erros: r.erros ?? 0 } }
}
