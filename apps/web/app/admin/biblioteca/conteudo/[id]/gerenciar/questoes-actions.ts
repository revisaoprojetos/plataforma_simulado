'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { confirmarImportQuestoes } from '@/app/admin/banco-questoes/actions'
import type { QuestaoImport } from '@/app/admin/banco-questoes/import-types'
import type { QuestaoConjuntoItem } from './questoes-tipos'

// Gestão das QUESTÕES de um card "Conjunto de questões" (tipo_origem='questoes'). As questões vêm do
// BANCO (simulado_questoes) por referência em simulado_conteudo_quiz_questoes. Reuso total: adicionar do
// banco (ids) e importar planilha (confirmarImportQuestoes) — igual ao simulado.

async function guard() {
  const a = await getCurrentAccess()
  const pode = a.isAdmin || a.permissions.includes('configuracoes:manage') || a.permissions.includes('questoes:update') || a.permissions.includes('simulados:update')
  if (!pode) return { error: 'Sem permissão.' as const }
  if (!a.tenantId) return { error: 'Tenant não resolvido.' as const }
  return { tenantId: a.tenantId, atorId: a.userId ?? null }
}

export async function listarQuestoesConjunto(documentoId: string): Promise<{ ok: boolean; itens?: QuestaoConjuntoItem[]; error?: string }> {
  const g = await guard(); if ('error' in g) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: links } = await svc.from('simulado_conteudo_quiz_questoes')
    .select('id, questao_id, ordem').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).order('ordem', { ascending: true })
  const ids = (links ?? []).map((l: any) => l.questao_id)
  const qmap = new Map<string, any>()
  if (ids.length) {
    const { data: qs } = await svc.from('simulado_questoes')
      .select('id, enunciado, tipo, nivel_dificuldade, disciplinas:simulado_disciplinas(nome)').in('id', ids)
    for (const q of (qs ?? []) as any[]) qmap.set(q.id, q)
  }
  const itens: QuestaoConjuntoItem[] = (links ?? []).map((l: any) => {
    const q = qmap.get(l.questao_id) ?? {}
    return { id: l.id, questao_id: l.questao_id, ordem: l.ordem, enunciado: q.enunciado ?? '', disciplina: q.disciplinas?.nome ?? null, tipo: q.tipo ?? null, nivel: q.nivel_dificuldade ?? null }
  })
  return { ok: true, itens }
}

export async function adicionarQuestoesConjunto(documentoId: string, questaoIds: string[]): Promise<{ ok: boolean; adicionadas?: number; error?: string }> {
  const g = await guard(); if ('error' in g) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const ids = [...new Set(questaoIds.filter(Boolean))]
  if (!ids.length) return { ok: true, adicionadas: 0 }
  const { data: maxRow } = await svc.from('simulado_conteudo_quiz_questoes')
    .select('ordem').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).order('ordem', { ascending: false }).limit(1).maybeSingle()
  let ordem = ((maxRow as any)?.ordem ?? -1) + 1
  const rows = ids.map((qid) => ({ tenant_id: g.tenantId, documento_id: documentoId, questao_id: qid, ordem: ordem++ }))
  const { error } = await svc.from('simulado_conteudo_quiz_questoes').upsert(rows, { onConflict: 'documento_id,questao_id', ignoreDuplicates: true })
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_conteudo_documentos', entidadeId: documentoId, depois: { questoes_adicionadas: ids.length }, tenantId: g.tenantId, atorId: g.atorId }).catch(() => {})
  revalidatePath(`/admin/biblioteca/conteudo/${documentoId}/gerenciar`)
  return { ok: true, adicionadas: ids.length }
}

export async function importarQuestoesConjunto(documentoId: string, questoes: QuestaoImport[]): Promise<{ ok: boolean; criadas?: number; adicionadas?: number; error?: string }> {
  const g = await guard(); if ('error' in g) return { ok: false, error: g.error }
  if (!questoes?.length) return { ok: false, error: 'Nada para importar.' }
  // Cria/atualiza no banco do tenant (sem banco específico) e devolve os ids.
  const r = await confirmarImportQuestoes(null, questoes)
  if (!r.ok) return { ok: false, error: r.error }
  const ids = ((r as any).ids ?? []).filter(Boolean) as string[]
  if (ids.length) await adicionarQuestoesConjunto(documentoId, ids)
  return { ok: true, criadas: (r as any).criadas, adicionadas: ids.length }
}

export async function removerQuestaoConjunto(documentoId: string, questaoId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard(); if ('error' in g) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_conteudo_quiz_questoes').delete()
    .eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('questao_id', questaoId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/biblioteca/conteudo/${documentoId}/gerenciar`)
  return { ok: true }
}

export async function listarDisciplinasTenant(): Promise<{ id: string; nome: string }[]> {
  const g = await guard(); if ('error' in g) return []
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', g.tenantId).order('nome', { ascending: true })
  return (data ?? []) as { id: string; nome: string }[]
}
