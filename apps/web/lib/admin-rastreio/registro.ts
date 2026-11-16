import 'server-only'
import { cookies, headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { parseUserAgent } from '@/lib/acessos/user-agent'
import { contextoReq, ipDeHeaders } from '@/lib/acessos/registro'

/**
 * REGISTRO DE ACESSOS DA EQUIPE (admins). Backend-first, fire-and-forget e TOLERANTE:
 * - nunca lança e nunca bloqueia a operação de negócio;
 * - sem a migração 20261121100000 aplicada, as gravações viram no-op (tabela ausente pausa por 10 min);
 * - IP/UA são dados pessoais (LGPD): só leitura por admin com `acessos:view`.
 * A sessão é identificada por um cookie httpOnly próprio (`adm_sid`, uuid da linha — NÃO é credencial de acesso).
 */

export const T_SESSOES = 'simulado_admin_sessoes'
export const T_ATIV = 'simulado_admin_atividades'
export const COOKIE_SID = 'adm_sid'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const ehUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

let pausadoAte = 0
export function tabelaAusente(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  const m = String(err.message ?? '')
  if (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|Could not find the table|schema cache/i.test(m)) {
    pausadoAte = Date.now() + 10 * 60_000
    return true
  }
  return false
}
export const ativo = () => Date.now() >= pausadoAte

export interface EventoAdmin {
  tipo: 'pagina_vista' | 'tempo_pagina' | 'heartbeat'
  rota?: string
  duracaoSeg?: number
}

export function novoRequestId(h?: { get(n: string): string | null } | null): string {
  const v = h?.get('x-request-id')?.trim()
  return v ? v.slice(0, 80) : crypto.randomUUID()
}

async function criarSessao(userId: string, tenantId: string, ctx: { ip: string | null; ua: string | null }): Promise<string | null> {
  const ua = parseUserAgent(ctx.ua)
  const svc = createAdminClient()
  // RPC serializada por usuário: reaproveita sessão aberta recente (mesmo IP+UA) → lotes concorrentes não duplicam.
  const rpc = await svc.rpc('simulado_admin_sessao_obter', {
    p_tenant: tenantId, p_user: userId, p_ip: ctx.ip, p_ua: ctx.ua, p_navegador: ua.navegador, p_so: ua.so, p_dispositivo: ua.dispositivo,
  })
  if (!rpc.error) {
    const row = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as { id?: string } | null
    if (row?.id) return row.id
  } else if (tabelaAusente(rpc.error)) return null
  // Fallback (migration 20261121120000 ainda não aplicada): insert simples.
  const agora = new Date().toISOString()
  const { data, error } = await svc.from(T_SESSOES).insert({
    tenant_id: tenantId, user_id: userId, ip: ctx.ip, user_agent: ctx.ua, navegador: ua.navegador, so: ua.so, dispositivo: ua.dispositivo,
    iniciado_em: agora, ultimo_visto_em: agora,
  }).select('id').single()
  if (tabelaAusente(error) || error || !data) return null
  return (data as { id: string }).id
}

// Cache curto (60 s) de "este adm_sid pertence a user+tenant do ator" — evita 1 query por evento de auditoria.
const sidCache = new Map<string, { ok: boolean; exp: number }>()
export async function sidPertence(sid: string | null, userId: string | null, tenantId: string | null): Promise<string | null> {
  if (!sid || !userId || !tenantId || !ativo()) return null
  const k = `${sid}|${userId}|${tenantId}`
  const hit = sidCache.get(k)
  if (hit && hit.exp > Date.now()) return hit.ok ? sid : null
  let ok = false
  try {
    const { data, error } = await createAdminClient().from(T_SESSOES).select('id').eq('id', sid).eq('user_id', userId).eq('tenant_id', tenantId).maybeSingle()
    if (tabelaAusente(error)) return null
    ok = !error && !!data
  } catch { return null }
  if (sidCache.size > 2000) sidCache.clear()
  sidCache.set(k, { ok, exp: Date.now() + 60_000 })
  return ok ? sid : null
}

/** Cookie da sessão (leitura em Server Component/action/rota). */
export async function sidAtual(): Promise<string | null> {
  try { const v = (await cookies()).get(COOKIE_SID)?.value; return ehUuid(v) ? v : null } catch { return null }
}

const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 }

/**
 * LOGIN de admin: abre uma nova sessão de rastreio (+ evento `login`) e grava o cookie. Só para quem tem papel de equipe
 * no tenant (ou é super-admin) — evita registrar contas sem painel. Chamado pelas actions de login (best-effort).
 */
export async function iniciarSessaoAdmin(userId: string | null, tenantId: string | null): Promise<void> {
  try {
    if (!userId || !tenantId || !ativo()) return
    const svc = createAdminClient()
    const [ac, sa] = await Promise.all([
      svc.from('simulado_tenant_acessos').select('role').eq('user_id', userId).eq('tenant_id', tenantId).eq('ativo', true).maybeSingle(),
      svc.from('simulado_super_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    ])
    const role = (ac.data as { role?: string | null } | null)?.role
    if (!sa.data && (!role || role === 'estudante')) return
    const ctx = await contextoReq()
    const sid = await criarSessao(userId, tenantId, ctx)
    if (!sid) return
    const h = await headers().catch(() => null)
    await svc.from(T_ATIV).insert({ tenant_id: tenantId, user_id: userId, sessao_id: sid, tipo: 'login', ip: ctx.ip, request_id: novoRequestId(h) })
    try { (await cookies()).set(COOKIE_SID, sid, COOKIE_OPTS) } catch { /* fora de contexto com cookies mutáveis */ }
  } catch { /* nunca quebra o login */ }
}

/** LOGOUT: marca a sessão como encerrada e limpa o cookie. */
export async function encerrarSessaoAtualAdmin(userId: string | null, tenantId: string | null, motivo = 'logout'): Promise<void> {
  try {
    const sid = await sidAtual()
    if (!sid || !ativo()) return
    const svc = createAdminClient()
    const agora = new Date().toISOString()
    const q = svc.from(T_SESSOES).update({ encerrado_em: agora, ultimo_visto_em: agora, motivo }).eq('id', sid).is('encerrado_em', null)
    const { error } = tenantId ? await q.eq('tenant_id', tenantId) : await q
    if (tabelaAusente(error)) return
    if (userId && tenantId) await svc.from(T_ATIV).insert({ tenant_id: tenantId, user_id: userId, sessao_id: sid, tipo: 'logout' })
    try { (await cookies()).delete(COOKIE_SID) } catch { /* ignore */ }
  } catch { /* nunca quebra o logout */ }
}

export interface ResultadoLote { sid: string | null; encerrada: boolean; novaSessao: boolean }

/**
 * Processa um lote vindo do navegador (rota /api/admin/rastreio). Resolve/cria a sessão, atualiza heartbeat,
 * página atual e tempo ativo e grava as atividades. Se a sessão foi encerrada por um admin → `encerrada: true`.
 */
export async function processarLoteAdmin(a: {
  userId: string; tenantId: string; sidCookie: string | null; eventos: EventoAdmin[]; ip: string | null; ua: string | null; requestId: string
}): Promise<ResultadoLote> {
  if (!ativo()) return { sid: a.sidCookie, encerrada: false, novaSessao: false }
  const svc = createAdminClient()
  let sid = a.sidCookie
  let novaSessao = false
  if (sid) {
    const { data, error } = await svc.from(T_SESSOES).select('id, encerrado_em').eq('id', sid).eq('tenant_id', a.tenantId).eq('user_id', a.userId).maybeSingle()
    if (tabelaAusente(error)) return { sid, encerrada: false, novaSessao: false }
    const row = data as { id: string; encerrado_em: string | null } | null
    if (row?.encerrado_em) return { sid, encerrada: true, novaSessao: false }
    if (!row) sid = null
  }
  if (!sid) {
    // Encerrada por um admin há pouco (e sem novo login): NÃO recria sessão automaticamente.
    const corte = new Date(Date.now() - 10 * 60_000).toISOString()
    const { data: enc } = await svc.from(T_SESSOES).select('id').eq('tenant_id', a.tenantId).eq('user_id', a.userId)
      .eq('motivo', 'encerrada_admin').gte('encerrado_em', corte).limit(1)
    if (enc && enc.length) return { sid: null, encerrada: true, novaSessao: false }
    sid = await criarSessao(a.userId, a.tenantId, { ip: a.ip, ua: a.ua })
    if (!sid) return { sid: null, encerrada: false, novaSessao: false }
    novaSessao = true
  }
  const ultimaPagina = [...a.eventos].reverse().find((e) => e.tipo === 'pagina_vista' && e.rota)?.rota
  const somaTempo = Math.min(6 * 3600, a.eventos.reduce((s, e) => s + (e.tipo === 'tempo_pagina' ? (e.duracaoSeg ?? 0) : 0), 0))
  // Atômico: incremento no SQL (sem read-modify-write). Fallback sem a migration: update simples sem somar tempo.
  const at = await svc.rpc('simulado_admin_sessao_somar', { p_sid: sid, p_tenant: a.tenantId, p_user: a.userId, p_seg: somaTempo, p_rota: ultimaPagina ?? null })
  if (tabelaAusente(at.error)) return { sid, encerrada: false, novaSessao }
  if (at.error) {
    await svc.from(T_SESSOES).update({ ultimo_visto_em: new Date().toISOString(), ...(ultimaPagina ? { rota_atual: ultimaPagina } : {}) }).eq('id', sid).eq('tenant_id', a.tenantId).is('encerrado_em', null)
  } else if (at.data === false) {
    return { sid, encerrada: true, novaSessao: false } // encerrada entre a leitura e o incremento
  }

  const linhas = a.eventos.filter((e) => e.tipo !== 'heartbeat' && e.rota).map((e) => ({
    tenant_id: a.tenantId, user_id: a.userId, sessao_id: sid, tipo: e.tipo, rota: e.rota,
    duracao_seg: e.tipo === 'tempo_pagina' ? Math.max(0, Math.min(86_400, Math.round(e.duracaoSeg ?? 0))) : null,
    ip: a.ip, request_id: a.requestId,
  }))
  if (linhas.length) { const r = await svc.from(T_ATIV).insert(linhas); tabelaAusente(r.error) }
  return { sid, encerrada: false, novaSessao }
}

/**
 * Chamado por registrarAudit: grava a ação (mutação) como atividade `acao_api` na sessão do admin, para a linha
 * do tempo. Só quando há cookie de sessão de admin (ou seja, o ator é equipe com navegador).
 */
export async function registrarAcaoApiAdmin(a: {
  userId: string; tenantId: string; sid: string; rota: string | null; rotaApi: string | null; metodo?: string | null
  ip: string | null; requestId: string; operacao: string; entidade: string
}): Promise<void> {
  try {
    if (!ativo()) return
    const { error } = await createAdminClient().from(T_ATIV).insert({
      tenant_id: a.tenantId, user_id: a.userId, sessao_id: a.sid, tipo: 'acao_api', rota: a.rota, rota_api: a.rotaApi, metodo: a.metodo ?? null,
      status: 200, ip: a.ip, request_id: a.requestId, meta: { operacao: a.operacao, entidade: a.entidade },
    })
    tabelaAusente(error)
  } catch { /* best-effort */ }
}

export { ipDeHeaders }
