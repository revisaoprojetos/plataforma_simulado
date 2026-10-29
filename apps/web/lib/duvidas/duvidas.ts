import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Duvida, DuvidaMensagem, OrigemDuvida, StatusDuvida, AutorTipo } from './tipos'

// DÚVIDAS (eixo b) — camada de dados (I/O). Conversa PRIVADA 1:1 aluno↔professor. Tipos puros em ./tipos.
// Migração: supabase/migrations/20261027010000_duvidas_requerimentos.sql. RLS por tenant_id.
// tenantId/estudanteId vêm da SESSÃO (nunca do host) — padrão /nova.

export type { Duvida, DuvidaMensagem, OrigemDuvida, StatusDuvida, AutorTipo } from './tipos'
export { STATUS_DUVIDA_LABEL } from './tipos'

const T_DUV = 'simulado_duvidas'
const T_MSG = 'simulado_duvida_mensagens'

const SEL_DUV = 'id, estudante_id, titulo, categoria, disciplina_id, origem, status, ultima_msg_em, criado_em'
const SEL_MSG = 'id, duvida_id, autor_tipo, autor_id, autor_nome, texto, criado_em'

// ───────────────────────────── Aluno (leitura) ─────────────────────────────

/** Dúvidas do aluno, mais recentes (por atividade) primeiro. */
export async function listarDuvidasAluno(
  svc: SupabaseClient, tenantId: string, estudanteId: string,
): Promise<Duvida[]> {
  if (!tenantId || !estudanteId) return []
  const rows = await fetchAll<Duvida>(() => svc.from(T_DUV).select(SEL_DUV)
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
    .order('ultima_msg_em', { ascending: false }).order('id', { ascending: false }))
  return rows ?? []
}

/** Uma dúvida (confere dono) + suas mensagens em ordem cronológica. */
export async function carregarDuvida(
  svc: SupabaseClient, tenantId: string, estudanteId: string, duvidaId: string,
): Promise<{ duvida: Duvida; mensagens: DuvidaMensagem[] } | null> {
  if (!tenantId || !estudanteId || !duvidaId) return null
  const { data: d } = await svc.from(T_DUV).select(SEL_DUV)
    .eq('tenant_id', tenantId).eq('id', duvidaId).eq('estudante_id', estudanteId).maybeSingle()
  if (!d) return null
  const msgs = await fetchAll<DuvidaMensagem>(() => svc.from(T_MSG).select(SEL_MSG)
    .eq('tenant_id', tenantId).eq('duvida_id', duvidaId).order('criado_em', { ascending: true }).order('id', { ascending: true }))
  return { duvida: d as Duvida, mensagens: msgs ?? [] }
}

// ───────────────────────────── Aluno (escrita) ─────────────────────────────

/** Cria uma dúvida + a 1ª mensagem (a pergunta). Retorna o id da dúvida. */
export async function criarDuvida(
  svc: SupabaseClient,
  input: { tenantId: string; estudanteId: string; alunoNome?: string | null; titulo: string; categoria?: string | null; disciplinaId?: string | null; origem?: OrigemDuvida; texto?: string | null },
): Promise<{ id: string } | { erro: string }> {
  const titulo = input.titulo?.trim()
  if (!input.tenantId || !input.estudanteId) return { erro: 'sessão inválida' }
  if (!titulo) return { erro: 'escreva a sua dúvida' }
  const agora = new Date().toISOString()
  const { data, error } = await svc.from(T_DUV).insert({
    tenant_id: input.tenantId, estudante_id: input.estudanteId, titulo,
    categoria: input.categoria ?? null, disciplina_id: input.disciplinaId ?? null,
    origem: input.origem ?? { tipo: 'geral' }, status: 'aberta', ultima_msg_em: agora,
  }).select('id').single()
  if (error || !data) return { erro: error?.message || 'falha ao abrir a dúvida' }
  // 1ª mensagem = corpo da pergunta (usa o título quando não há corpo separado).
  await svc.from(T_MSG).insert({
    tenant_id: input.tenantId, duvida_id: data.id, autor_tipo: 'aluno',
    autor_id: input.estudanteId, autor_nome: input.alunoNome ?? 'Você', texto: (input.texto?.trim() || titulo),
  })
  return { id: data.id }
}

/** Aluno responde na própria conversa (reabre p/ 'aberta' se estava respondida). */
export async function responderDuvidaAluno(
  svc: SupabaseClient,
  input: { tenantId: string; estudanteId: string; alunoNome?: string | null; duvidaId: string; texto: string },
): Promise<{ ok: boolean; erro?: string }> {
  const texto = input.texto?.trim()
  if (!input.tenantId || !input.estudanteId || !input.duvidaId) return { ok: false, erro: 'parâmetros inválidos' }
  if (!texto) return { ok: false, erro: 'escreva uma mensagem' }
  const { data: d } = await svc.from(T_DUV).select('id, status')
    .eq('tenant_id', input.tenantId).eq('id', input.duvidaId).eq('estudante_id', input.estudanteId).maybeSingle()
  if (!d) return { ok: false, erro: 'dúvida não encontrada' }
  const agora = new Date().toISOString()
  const { error } = await svc.from(T_MSG).insert({
    tenant_id: input.tenantId, duvida_id: input.duvidaId, autor_tipo: 'aluno',
    autor_id: input.estudanteId, autor_nome: input.alunoNome ?? 'Você', texto,
  })
  if (error) return { ok: false, erro: error.message }
  // volta a 'aberta' (aluno tem nova pergunta); não mexe se já resolvida.
  const novoStatus = d.status === 'resolvida' ? 'resolvida' : 'aberta'
  await svc.from(T_DUV).update({ status: novoStatus, ultima_msg_em: agora, atualizado_em: agora })
    .eq('tenant_id', input.tenantId).eq('id', input.duvidaId)
  return { ok: true }
}

/** Aluno marca a dúvida como resolvida (ou reabre). */
export async function definirResolvidaAluno(
  svc: SupabaseClient, tenantId: string, estudanteId: string, duvidaId: string, resolvida: boolean,
): Promise<{ ok: boolean; erro?: string }> {
  if (!tenantId || !estudanteId || !duvidaId) return { ok: false, erro: 'parâmetros inválidos' }
  const { data: d } = await svc.from(T_DUV).select('id')
    .eq('tenant_id', tenantId).eq('id', duvidaId).eq('estudante_id', estudanteId).maybeSingle()
  if (!d) return { ok: false, erro: 'dúvida não encontrada' }
  const agora = new Date().toISOString()
  const { error } = await svc.from(T_DUV).update({
    status: resolvida ? 'resolvida' : 'aberta', resolvida_em: resolvida ? agora : null, atualizado_em: agora,
  }).eq('tenant_id', tenantId).eq('id', duvidaId)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

// ───────────────────────────── Admin (fila + responder) ─────────────────────────────

/** Fila de dúvidas do tenant (todas), com filtro opcional por status. */
export async function listarDuvidasAdmin(
  svc: SupabaseClient, tenantId: string, filtro?: { status?: StatusDuvida },
): Promise<Duvida[]> {
  if (!tenantId) return []
  const rows = await fetchAll<Duvida>(() => {
    let q = svc.from(T_DUV).select(SEL_DUV).eq('tenant_id', tenantId)
    if (filtro?.status) q = q.eq('status', filtro.status)
    return q.order('ultima_msg_em', { ascending: false }).order('id', { ascending: false })
  })
  return rows ?? []
}

/** Admin carrega uma dúvida (qualquer aluno do tenant) + mensagens. */
export async function carregarDuvidaAdmin(
  svc: SupabaseClient, tenantId: string, duvidaId: string,
): Promise<{ duvida: Duvida; mensagens: DuvidaMensagem[] } | null> {
  if (!tenantId || !duvidaId) return null
  const { data: d } = await svc.from(T_DUV).select(SEL_DUV).eq('tenant_id', tenantId).eq('id', duvidaId).maybeSingle()
  if (!d) return null
  const msgs = await fetchAll<DuvidaMensagem>(() => svc.from(T_MSG).select(SEL_MSG)
    .eq('tenant_id', tenantId).eq('duvida_id', duvidaId).order('criado_em', { ascending: true }).order('id', { ascending: true }))
  return { duvida: d as Duvida, mensagens: msgs ?? [] }
}

/** Professor/admin responde → grava mensagem e marca 'respondida'. */
export async function responderDuvidaAdmin(
  svc: SupabaseClient,
  input: { tenantId: string; duvidaId: string; autorId?: string | null; autorNome?: string | null; texto: string },
): Promise<{ ok: boolean; erro?: string }> {
  const texto = input.texto?.trim()
  if (!input.tenantId || !input.duvidaId) return { ok: false, erro: 'parâmetros inválidos' }
  if (!texto) return { ok: false, erro: 'escreva a resposta' }
  const { data: d } = await svc.from(T_DUV).select('id').eq('tenant_id', input.tenantId).eq('id', input.duvidaId).maybeSingle()
  if (!d) return { ok: false, erro: 'dúvida não encontrada' }
  const agora = new Date().toISOString()
  const { error } = await svc.from(T_MSG).insert({
    tenant_id: input.tenantId, duvida_id: input.duvidaId, autor_tipo: 'professor',
    autor_id: input.autorId ?? null, autor_nome: input.autorNome ?? 'Equipe', texto,
  })
  if (error) return { ok: false, erro: error.message }
  await svc.from(T_DUV).update({ status: 'respondida', ultima_msg_em: agora, atualizado_em: agora })
    .eq('tenant_id', input.tenantId).eq('id', input.duvidaId)
  return { ok: true }
}
