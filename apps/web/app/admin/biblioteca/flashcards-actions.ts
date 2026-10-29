'use server'

// AUTORIA DE FLASHCARDS POR MATERIAL (admin). Envolve a lib pronta (lib/flashcards/flashcards.ts)
// com o padrão de SEGURANÇA das server actions admin: checkPermission + service role + tenant/ator
// resolvidos da SESSÃO ADMIN (nunca do host). Reusa o resource de conteúdo (configuracoes:view/update),
// o mesmo que protege a página de gerenciamento do material. NÃO edita a lib nem a migração.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import {
  listarFlashcardsAdmin, criarFlashcard, atualizarFlashcard,
  removerFlashcard, reordenarFlashcards, type Flashcard,
} from '@/lib/flashcards/flashcards'

export type FlashcardAdmin = Flashcard & { criado_em: string }

const T_CARD = 'simulado_flashcards'
// A migração 20261027000000 ainda NÃO está em produção: a tela não pode quebrar — detecta a tabela
// ausente e devolve lista vazia + aviso discreto (em vez de propagar o erro).
const TABELA_AUSENTE = /relation .* does not exist|could not find the table|schema cache|does not exist/i

async function guard(acao: 'view' | 'update') {
  const perm = acao === 'view' ? 'configuracoes:view' : 'configuracoes:update'
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

/** Lista TODOS os cartões do material (inclui inativos) para a tela de autoria. */
export async function listarFlashcardsDoMaterial(
  documentoId: string,
): Promise<{ ok: boolean; error?: string; aviso?: string; itens: FlashcardAdmin[] }> {
  const g = await guard('view'); if (!g.ok) return { ok: false, error: g.error, itens: [] }
  const svc = createAdminClient()
  try {
    const itens = await listarFlashcardsAdmin(svc, g.tenantId, documentoId)
    return { ok: true, itens }
  } catch (e: any) {
    if (TABELA_AUSENTE.test(e?.message || '')) {
      return { ok: true, itens: [], aviso: 'Os flashcards ficam disponíveis após a migração ser aplicada em produção.' }
    }
    return { ok: false, error: e?.message || 'Falha ao carregar os flashcards.', itens: [] }
  }
}

/** Cria um cartão (ordem no fim, por padrão). */
export async function criarFlashcardMaterial(
  documentoId: string, frente: string, verso: string,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const r = await criarFlashcard(svc, {
    tenantId: g.tenantId, documentoId, frente, verso, criadoPor: g.atorId,
  })
  if ('erro' in r) {
    return { ok: false, error: TABELA_AUSENTE.test(r.erro) ? 'Rode a migração de flashcards (20261027000000).' : r.erro }
  }
  await registrarAudit({ operacao: 'INSERT', entidade: T_CARD, entidadeId: r.id, depois: { documento_id: documentoId, frente, verso }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca')
  return { ok: true, id: r.id }
}

/** Atualiza frente/verso/ordem/ativo de um cartão. */
export async function atualizarFlashcardMaterial(
  id: string, patch: { frente?: string; verso?: string; ordem?: number; ativo?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const r = await atualizarFlashcard(svc, g.tenantId, id, patch)
  if (!r.ok) return { ok: false, error: r.erro && TABELA_AUSENTE.test(r.erro) ? 'Rode a migração de flashcards (20261027000000).' : r.erro }
  const op = patch.ativo === undefined ? 'UPDATE' : patch.ativo ? 'LIBERAR' : 'BLOQUEAR'
  await registrarAudit({ operacao: op, entidade: T_CARD, entidadeId: id, depois: patch as Record<string, unknown>, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}

/** Remove um cartão (cascata apaga as revisões dos alunos). */
export async function removerFlashcardMaterial(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const r = await removerFlashcard(svc, g.tenantId, id)
  if (!r.ok) return { ok: false, error: r.erro && TABELA_AUSENTE.test(r.erro) ? 'Rode a migração de flashcards (20261027000000).' : r.erro }
  await registrarAudit({ operacao: 'DELETE', entidade: T_CARD, entidadeId: id, antes: { id }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}

/** Reordena em lote: [{ id, ordem }]. */
export async function reordenarFlashcardsMaterial(
  itens: { id: string; ordem: number }[],
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const r = await reordenarFlashcards(svc, g.tenantId, itens)
  if (!r.ok) return { ok: false, error: r.erro && TABELA_AUSENTE.test(r.erro) ? 'Rode a migração de flashcards (20261027000000).' : r.erro }
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}
