'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

/**
 * "Questões da meta" (JurisClub): cada meta/aula do produto tem um QUIZ próprio. O quiz do conteúdo
 * (simulado_documento_quiz_questoes) é amarrado a `simulado_documentos`, então a meta ganha um documento-
 * CONTAINER (publicado, sem pasta/grupo — só serve de âncora das questões) guardado em `meta.quiz_documento_id`.
 * Toda a edição (banco, importar CSV, plataformas, ordem) reusa o QuizConteudoAdmin pelo `documentoId`.
 * Idempotente: se o container já existe e está vivo, devolve o mesmo.
 */
export async function obterQuizDaMetaAction(produtoId: string, itemId: string): Promise<{ ok: true; documentoId: string; titulo: string } | { ok: false; error: string }> {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('produtos:manage'))) return { ok: false, error: 'Sem permissão.' }
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido — recarregue a página.' }
  const svc = createAdminClient()
  const { data: item } = await svc.from('simulado_produto_modulo_itens').select('id, titulo, meta, subtipo')
    .eq('id', itemId).eq('produto_id', produtoId).eq('tenant_id', access.tenantId).eq('deletado', false).maybeSingle()
  if (!item) return { ok: false, error: 'Meta não encontrada.' }
  const meta = ((item as any).meta && typeof (item as any).meta === 'object' ? (item as any).meta : {}) as Record<string, unknown>
  const atual = typeof meta.quiz_documento_id === 'string' ? meta.quiz_documento_id : null
  if (atual) {
    const { data: doc } = await svc.from('simulado_documentos').select('id, deletado').eq('id', atual).eq('tenant_id', access.tenantId).maybeSingle()
    if (doc && !(doc as any).deletado) return { ok: true, documentoId: atual, titulo: (item as any).titulo }
  }
  const { data: novo, error } = await svc.from('simulado_documentos')
    .insert({ tenant_id: access.tenantId, titulo: `Questões · ${(item as any).titulo}`.slice(0, 200), pasta_id: null, publicado: true, criado_por: access.userId ?? null })
    .select('id').single()
  if (error || !novo) return { ok: false, error: error?.message || 'Não foi possível criar o quiz da meta.' }
  const documentoId = (novo as any).id as string
  const { error: e2 } = await svc.from('simulado_produto_modulo_itens').update({ meta: { ...meta, quiz_documento_id: documentoId } }).eq('id', itemId).eq('tenant_id', access.tenantId)
  if (e2) return { ok: false, error: e2.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_documentos', entidadeId: documentoId, depois: { origem: 'quiz_meta_produto', produto_id: produtoId, item_id: itemId }, tenantId: access.tenantId })
  return { ok: true, documentoId, titulo: (item as any).titulo }
}
