'use server'

// ATENDIMENTO (admin) — responder Dúvidas (conversa 1:1 aluno↔professor) e processar
// Requerimentos. Envolve as libs PRONTAS (lib/duvidas, lib/requerimentos) com o padrão
// de SEGURANÇA das server actions admin: checkPermission + service role + tenant/ator
// resolvidos da SESSÃO ADMIN (nunca do host) + auditoria + revalidate.
// NÃO edita a lib nem a migração (20261027010000_duvidas_requerimentos.sql).
//
// Permissão: reusa o resource `estudantes` do catálogo RBAC (lib/rbac-catalogo.ts) —
// atendimento é gestão/suporte ao aluno. `view` p/ ler a fila/thread, `update` p/ responder.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission, getAuthUser } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { carregarDuvidaAdmin, responderDuvidaAdmin } from '@/lib/duvidas/duvidas'
import type { Duvida, DuvidaMensagem } from '@/lib/duvidas/tipos'
import { responderRequerimento } from '@/lib/requerimentos/requerimentos'
import type { StatusRequerimento } from '@/lib/requerimentos/tipos'
import { resolverReporte } from '@/lib/demandas/demandas'
import type { StatusReporte } from '@/lib/demandas/tipos'

// A migração 20261027010000 pode ainda NÃO estar aplicada: a tela não pode quebrar — detecta a
// tabela ausente e devolve mensagem clara (em vez de propagar um erro genérico do Postgres).
const TABELA_AUSENTE = /relation .* does not exist|could not find the table|schema cache|does not exist/i
const AVISO_MIGRACAO = 'Rode a migração 20261027010000 (dúvidas e requerimentos).'
const AVISO_MIGRACAO_DEMANDAS = 'Rode a migração 20261027020000 (demandas: reportes e avaliações).'

async function guard(acao: 'view' | 'update') {
  const perm = acao === 'view' ? 'estudantes:view' : 'estudantes:update'
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  // Nome do admin para assinar a resposta (autorNome). Best-effort: metadata → email → 'Equipe'.
  let autorNome = 'Equipe'
  try {
    const u = await getAuthUser()
    autorNome = (u?.user_metadata?.nome as string | undefined) || u?.email || 'Equipe'
  } catch { /* sem sessão supabase */ }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null, autorNome }
}

// ───────────────────────────── Dúvidas ─────────────────────────────

export type ThreadDuvida = {
  duvida: Duvida
  mensagens: DuvidaMensagem[]
  estudanteNome: string
  estudanteEmail: string | null
}

/** Carrega uma dúvida + suas mensagens (para o painel de resposta), já com o nome do aluno. */
export async function carregarThreadDuvidaAction(
  duvidaId: string,
): Promise<{ ok: boolean; error?: string; thread?: ThreadDuvida }> {
  const g = await guard('view'); if (!g.ok) return g
  const svc = createAdminClient()
  try {
    const data = await carregarDuvidaAdmin(svc, g.tenantId, duvidaId)
    if (!data) return { ok: false, error: 'Dúvida não encontrada.' }
    let estudanteNome = 'Aluno'; let estudanteEmail: string | null = null
    try {
      const { data: est } = await svc.from('simulado_estudantes')
        .select('nome, email').eq('tenant_id', g.tenantId).eq('id', data.duvida.estudante_id).maybeSingle()
      if (est) { estudanteNome = (est as any).nome ?? 'Aluno'; estudanteEmail = (est as any).email ?? null }
    } catch { /* nome é só enfeite */ }
    return { ok: true, thread: { ...data, estudanteNome, estudanteEmail } }
  } catch (e: any) {
    if (TABELA_AUSENTE.test(e?.message || '')) return { ok: false, error: AVISO_MIGRACAO }
    return { ok: false, error: e?.message || 'Falha ao carregar a dúvida.' }
  }
}

/** Responde uma dúvida (grava mensagem do professor e marca 'respondida'). */
export async function responderDuvidaAction(
  duvidaId: string, texto: string,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  if (!texto.trim()) return { ok: false, error: 'Escreva a resposta.' }
  const svc = createAdminClient()
  const r = await responderDuvidaAdmin(svc, {
    tenantId: g.tenantId, duvidaId, autorId: g.atorId, autorNome: g.autorNome, texto,
  })
  if (!r.ok) {
    return { ok: false, error: r.erro && TABELA_AUSENTE.test(r.erro) ? AVISO_MIGRACAO : r.erro }
  }
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_duvidas', entidadeId: duvidaId,
    depois: { status: 'respondida', resposta: texto.trim() }, atorId: g.atorId, tenantId: g.tenantId,
  }).catch(() => {})
  revalidatePath('/admin/atendimento')
  return { ok: true }
}

// ───────────────────────────── Requerimentos ─────────────────────────────

/** Responde e/ou muda o status de um requerimento. */
export async function responderRequerimentoAction(
  id: string, patch: { status?: StatusRequerimento; resposta?: string },
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const r = await responderRequerimento(svc, {
    tenantId: g.tenantId, id, status: patch.status,
    resposta: patch.resposta ?? undefined, respondidoPor: g.atorId,
  })
  if (!r.ok) {
    return { ok: false, error: r.erro && TABELA_AUSENTE.test(r.erro) ? AVISO_MIGRACAO : r.erro }
  }
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_requerimentos', entidadeId: id,
    depois: { status: patch.status ?? null, resposta: patch.resposta?.trim() ?? null }, atorId: g.atorId, tenantId: g.tenantId,
  }).catch(() => {})
  revalidatePath('/admin/atendimento')
  return { ok: true }
}

// ───────────────────────────── Demandas (reportes) ─────────────────────────────

/** Responde e/ou muda o status de um reporte de material. */
export async function resolverReporteAction(
  id: string, patch: { status?: StatusReporte; resposta?: string },
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const r = await resolverReporte(svc, {
    tenantId: g.tenantId, id, status: patch.status,
    resposta: patch.resposta ?? undefined, resolvidoPor: g.atorId,
  })
  if (!r.ok) {
    return { ok: false, error: r.erro && TABELA_AUSENTE.test(r.erro) ? AVISO_MIGRACAO_DEMANDAS : r.erro }
  }
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_material_reportes', entidadeId: id,
    depois: { status: patch.status ?? null, resposta: patch.resposta?.trim() ?? null }, atorId: g.atorId, tenantId: g.tenantId,
  }).catch(() => {})
  revalidatePath('/admin/atendimento')
  return { ok: true }
}
