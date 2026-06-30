'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { softDelete } from '@/lib/soft-delete'
import { rankearSimulado } from '@/lib/ranking'

interface NovoEstudanteData {
  nome: string
  email: string
  cpf?: string
  telefone?: string
}

export async function createEstudanteAction(data: NovoEstudanteData) {
  if (!(await checkPermission('estudantes:create'))) return { error: 'Você não tem permissão para cadastrar estudantes.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido. Verifique o acesso.' }

  const supabase = await createServiceClient()

  // Cria conta global (auth.users). Se o e-mail já existe, segue sem recriar.
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: data.email,
    email_confirm: true,
    user_metadata: { full_name: data.nome },
  })

  const userId = authUser?.user?.id ?? null
  if (authError && !/already.*registered|already.*exists/i.test(authError.message)) {
    return { error: authError.message }
  }

  // Cria o perfil do estudante no tenant atual.
  const { error: profileError } = await supabase.from('simulado_estudantes').insert({
    tenant_id: tenantId,
    user_id: userId,
    nome: data.nome,
    email: data.email,
    cpf: data.cpf || null,
    telefone: data.telefone || null,
  })

  if (profileError) {
    // Rollback do auth user apenas se foi criado agora.
    if (userId && !authError) await supabase.auth.admin.deleteUser(userId)
    return { error: profileError.message }
  }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_estudantes', entidadeId: userId, depois: { nome: data.nome, email: data.email } })

  revalidatePath('/admin/estudantes')
  redirect('/admin/estudantes')
}

/** Soft delete do estudante → vai para a Lixeira (recuperável). Sessões/vínculos preservados. */
export async function deleteEstudanteAction(id: string) {
  if (!(await checkPermission('estudantes:delete'))) return { error: 'Você não tem permissão para excluir estudantes.' }
  const { error } = await softDelete('simulado_estudantes', id)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_estudantes', entidadeId: id, depois: { deletado: true } })
  revalidatePath('/admin/estudantes')
  return { ok: true }
}

/** Soft delete de UMA sessão (tentativa) → sai do histórico/resultados/ranking; recalcula o ranking. */
export async function excluirSessaoAction(sessaoId: string, simuladoId: string, estudanteId: string) {
  if (!(await checkPermission('simulados:update'))) return { error: 'Você não tem permissão.' }
  const { error } = await softDelete('simulado_sessoes_prova', sessaoId)
  if (error) return { error: error.message }
  // A sessão excluída sai do cálculo: recalcula o ranking do simulado.
  if (simuladoId) { try { await rankearSimulado(createAdminClient(), simuladoId) } catch { /* ranking best-effort */ } }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_sessoes_prova', entidadeId: sessaoId, depois: { deletado: true } })
  revalidatePath(`/admin/estudantes/${estudanteId}`)
  if (simuladoId) revalidatePath(`/admin/simulados/${simuladoId}`)
  return { ok: true }
}
