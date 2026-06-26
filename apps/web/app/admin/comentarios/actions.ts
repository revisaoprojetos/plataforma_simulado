'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

export async function aprovarComentario(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_comentarios_questao').update({ aprovado: true }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_comentarios_questao', entidadeId: id, depois: { aprovado: true } })
  revalidatePath('/admin/comentarios')
  return { ok: true }
}

export async function excluirComentario(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_comentarios_questao').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_comentarios_questao', entidadeId: id })
  revalidatePath('/admin/comentarios')
  return { ok: true }
}
