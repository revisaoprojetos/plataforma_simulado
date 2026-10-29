import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Requerimento, StatusRequerimento } from './tipos'

// REQUERIMENTOS (eixo b) — camada de dados (I/O). Tipos/constantes puros em ./tipos.
// Migração: supabase/migrations/20261027010000_duvidas_requerimentos.sql. RLS por tenant_id.

export type { Requerimento, StatusRequerimento, TipoRequerimento } from './tipos'
export { TIPOS_REQUERIMENTO, STATUS_REQ_LABEL } from './tipos'

const T_REQ = 'simulado_requerimentos'
const SEL = 'id, estudante_id, protocolo, tipo, descricao, contexto, status, resposta, respondido_em, criado_em'

/** Gera um protocolo RQ-##### único por tenant (tenta algumas vezes contra a constraint). */
async function gerarProtocolo(svc: SupabaseClient, tenantId: string): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const n = 10000 + Math.floor(Math.random() * 90000)
    const proto = `RQ-${n}`
    const { data } = await svc.from(T_REQ).select('id').eq('tenant_id', tenantId).eq('protocolo', proto).maybeSingle()
    if (!data) return proto
  }
  return `RQ-${Date.now().toString().slice(-6)}` // fallback praticamente único
}

// ───────────────────────────── Aluno ─────────────────────────────

export async function listarRequerimentosAluno(
  svc: SupabaseClient, tenantId: string, estudanteId: string,
): Promise<Requerimento[]> {
  if (!tenantId || !estudanteId) return []
  const rows = await fetchAll<Requerimento>(() => svc.from(T_REQ).select(SEL)
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).order('criado_em', { ascending: false }).order('id', { ascending: false }))
  return rows ?? []
}

export async function criarRequerimento(
  svc: SupabaseClient,
  input: { tenantId: string; estudanteId: string; tipo: string; descricao: string; contexto?: string | null },
): Promise<{ id: string; protocolo: string } | { erro: string }> {
  const tipo = input.tipo?.trim(); const descricao = input.descricao?.trim()
  if (!input.tenantId || !input.estudanteId) return { erro: 'sessão inválida' }
  if (!tipo) return { erro: 'escolha o tipo' }
  if (!descricao) return { erro: 'descreva o pedido' }
  const protocolo = await gerarProtocolo(svc, input.tenantId)
  const { data, error } = await svc.from(T_REQ).insert({
    tenant_id: input.tenantId, estudante_id: input.estudanteId, protocolo, tipo, descricao,
    contexto: input.contexto ?? null, status: 'em_analise',
  }).select('id').single()
  if (error || !data) return { erro: error?.message || 'falha ao abrir o requerimento' }
  return { id: data.id, protocolo }
}

// ───────────────────────────── Admin ─────────────────────────────

export async function listarRequerimentosAdmin(
  svc: SupabaseClient, tenantId: string, filtro?: { status?: StatusRequerimento },
): Promise<Requerimento[]> {
  if (!tenantId) return []
  const rows = await fetchAll<Requerimento>(() => {
    let q = svc.from(T_REQ).select(SEL).eq('tenant_id', tenantId)
    if (filtro?.status) q = q.eq('status', filtro.status)
    return q.order('criado_em', { ascending: false }).order('id', { ascending: false })
  })
  return rows ?? []
}

/** Equipe responde e/ou muda o status do requerimento. */
export async function responderRequerimento(
  svc: SupabaseClient,
  input: { tenantId: string; id: string; status?: StatusRequerimento; resposta?: string | null; respondidoPor?: string | null },
): Promise<{ ok: boolean; erro?: string }> {
  if (!input.tenantId || !input.id) return { ok: false, erro: 'parâmetros inválidos' }
  const { data: r } = await svc.from(T_REQ).select('id').eq('tenant_id', input.tenantId).eq('id', input.id).maybeSingle()
  if (!r) return { ok: false, erro: 'requerimento não encontrado' }
  const agora = new Date().toISOString()
  const upd: Record<string, unknown> = { atualizado_em: agora }
  if (input.status) upd.status = input.status
  if (input.resposta != null) { upd.resposta = input.resposta.trim(); upd.respondido_em = agora; upd.respondido_por = input.respondidoPor ?? null }
  const { error } = await svc.from(T_REQ).update(upd).eq('tenant_id', input.tenantId).eq('id', input.id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}
