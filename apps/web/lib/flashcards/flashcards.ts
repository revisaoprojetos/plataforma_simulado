import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'
import {
  type Flashcard, type FlashcardRevisao, type ResultadoRevisao,
  proximoAgendamento,
} from './tipos'

// FLASHCARDS (eixo b) — camada de dados (I/O). Tipos + lógica SRS PURA ficam em ./tipos (sem server-only,
// usável pelo client). Aqui só o acesso ao banco. Cartões por material (autoria admin) + SRS por aluno.
// Migração: supabase/migrations/20261027000000_flashcards.sql. RLS por tenant_id.
// O service client (createAdminClient) é passado pelo chamador; tenantId/estudanteId vêm da SESSÃO
// (nunca do host) — mesmo padrão das telas /nova.

// Reexporta os tipos/puros para quem já importa deste módulo (consumidores server-side).
export type { Flashcard, FlashcardRevisao, ResultadoRevisao, EstadoCard } from './tipos'
export { estadoDaCaixa, proximoAgendamento, contarDevidos, CAIXA_MAX, INTERVALOS_DIAS } from './tipos'

const T_CARD = 'simulado_flashcards'
const T_REV = 'simulado_flashcard_revisoes'

// ───────────────────────────── Aluno (leitura) ─────────────────────────────

/** Cartões ATIVOS de um material, na ordem definida pelo admin. */
export async function listarFlashcardsDocumento(
  svc: SupabaseClient, tenantId: string, documentoId: string,
): Promise<Flashcard[]> {
  if (!tenantId || !documentoId) return []
  const rows = await fetchAll<Flashcard>(() => svc.from(T_CARD)
    .select('id, documento_id, frente, verso, ordem, ativo')
    .eq('tenant_id', tenantId).eq('documento_id', documentoId).eq('ativo', true)
    .order('ordem', { ascending: true }).order('id', { ascending: true }))
  return rows ?? []
}

/** Revisões do aluno para um conjunto de cartões → Map por flashcard_id. */
export async function carregarRevisoesAluno(
  svc: SupabaseClient, tenantId: string, estudanteId: string, flashcardIds: string[],
): Promise<Map<string, FlashcardRevisao>> {
  const out = new Map<string, FlashcardRevisao>()
  if (!tenantId || !estudanteId || flashcardIds.length === 0) return out
  // conjunto pequeno (cartões de 1 material); consulta direta com .in() é segura aqui.
  const { data } = await svc.from(T_REV)
    .select('flashcard_id, caixa, acertos, erros, ultimo_resultado, ultima_revisao, proxima_revisao')
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).in('flashcard_id', flashcardIds)
  for (const r of (data ?? []) as FlashcardRevisao[]) out.set(r.flashcard_id, r)
  return out
}

// (contarDevidos/estadoDaCaixa/proximoAgendamento são puros → vivem em ./tipos e são reexportados acima.)

// ───────────────────────────── Aluno (escrita) ─────────────────────────────

/** Registra o resultado de uma revisão (upsert por aluno+cartão), avançando a caixa Leitner. */
export async function registrarRevisao(
  svc: SupabaseClient,
  input: { tenantId: string; estudanteId: string; flashcardId: string; resultado: ResultadoRevisao },
): Promise<{ ok: boolean; erro?: string; caixa?: number; proximaRevisao?: string }> {
  const { tenantId, estudanteId, flashcardId, resultado } = input
  if (!tenantId || !estudanteId || !flashcardId) return { ok: false, erro: 'parâmetros inválidos' }

  // Confere que o cartão é do tenant (evita gravar revisão de cartão alheio).
  const { data: card } = await svc.from(T_CARD).select('id').eq('tenant_id', tenantId).eq('id', flashcardId).maybeSingle()
  if (!card) return { ok: false, erro: 'cartão não encontrado' }

  const { data: atual } = await svc.from(T_REV)
    .select('id, caixa, acertos, erros').eq('tenant_id', tenantId)
    .eq('estudante_id', estudanteId).eq('flashcard_id', flashcardId).maybeSingle()

  const caixaAtual = (atual?.caixa as number | undefined) ?? 0
  const { caixa, proximaRevisao } = proximoAgendamento(caixaAtual, resultado)
  const agora = new Date().toISOString()
  const acertou = resultado !== 'errou'

  const payload = {
    tenant_id: tenantId, estudante_id: estudanteId, flashcard_id: flashcardId,
    caixa, ultimo_resultado: resultado, ultima_revisao: agora, proxima_revisao: proximaRevisao,
    acertos: (atual?.acertos ?? 0) + (acertou ? 1 : 0),
    erros: (atual?.erros ?? 0) + (acertou ? 0 : 1),
    atualizado_em: agora,
  }
  const { error } = await svc.from(T_REV).upsert(payload, { onConflict: 'estudante_id,flashcard_id' })
  if (error) return { ok: false, erro: error.message }
  return { ok: true, caixa, proximaRevisao }
}

// ───────────────────────────── Admin (autoria/CRUD) ─────────────────────────────

/** Todos os cartões de um material (inclui inativos) para a tela de autoria. */
export async function listarFlashcardsAdmin(
  svc: SupabaseClient, tenantId: string, documentoId: string,
): Promise<(Flashcard & { criado_em: string })[]> {
  if (!tenantId || !documentoId) return []
  const rows = await fetchAll<Flashcard & { criado_em: string }>(() => svc.from(T_CARD)
    .select('id, documento_id, frente, verso, ordem, ativo, criado_em')
    .eq('tenant_id', tenantId).eq('documento_id', documentoId)
    .order('ordem', { ascending: true }).order('id', { ascending: true }))
  return rows ?? []
}

export async function criarFlashcard(
  svc: SupabaseClient,
  input: { tenantId: string; documentoId: string; frente: string; verso: string; ordem?: number; criadoPor?: string | null },
): Promise<{ id: string } | { erro: string }> {
  const frente = input.frente?.trim(); const verso = input.verso?.trim()
  if (!input.tenantId || !input.documentoId) return { erro: 'tenant/material obrigatórios' }
  if (!frente || !verso) return { erro: 'frente e verso são obrigatórios' }
  let ordem = input.ordem
  if (ordem == null) {
    const { data: ult } = await svc.from(T_CARD).select('ordem')
      .eq('tenant_id', input.tenantId).eq('documento_id', input.documentoId)
      .order('ordem', { ascending: false }).limit(1).maybeSingle()
    ordem = ((ult?.ordem as number | undefined) ?? -1) + 1
  }
  const { data, error } = await svc.from(T_CARD).insert({
    tenant_id: input.tenantId, documento_id: input.documentoId,
    frente, verso, ordem, criado_por: input.criadoPor ?? null,
  }).select('id').single()
  if (error || !data) return { erro: error?.message || 'falha ao criar' }
  return { id: data.id }
}

export async function atualizarFlashcard(
  svc: SupabaseClient, tenantId: string, id: string,
  patch: { frente?: string; verso?: string; ordem?: number; ativo?: boolean },
): Promise<{ ok: boolean; erro?: string }> {
  if (!tenantId || !id) return { ok: false, erro: 'parâmetros inválidos' }
  const upd: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (patch.frente != null) upd.frente = patch.frente.trim()
  if (patch.verso != null) upd.verso = patch.verso.trim()
  if (patch.ordem != null) upd.ordem = patch.ordem
  if (patch.ativo != null) upd.ativo = patch.ativo
  const { error } = await svc.from(T_CARD).update(upd).eq('tenant_id', tenantId).eq('id', id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

export async function removerFlashcard(
  svc: SupabaseClient, tenantId: string, id: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!tenantId || !id) return { ok: false, erro: 'parâmetros inválidos' }
  // ON DELETE CASCADE remove as revisões vinculadas.
  const { error } = await svc.from(T_CARD).delete().eq('tenant_id', tenantId).eq('id', id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

/** Reordena em lote: [{id, ordem}]. */
export async function reordenarFlashcards(
  svc: SupabaseClient, tenantId: string, itens: { id: string; ordem: number }[],
): Promise<{ ok: boolean; erro?: string }> {
  if (!tenantId || itens.length === 0) return { ok: true }
  for (const it of itens) {
    const { error } = await svc.from(T_CARD).update({ ordem: it.ordem, atualizado_em: new Date().toISOString() })
      .eq('tenant_id', tenantId).eq('id', it.id)
    if (error) return { ok: false, erro: error.message }
  }
  return { ok: true }
}
