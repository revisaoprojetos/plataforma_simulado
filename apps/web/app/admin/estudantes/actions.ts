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

interface EditarEstudanteData {
  nome: string
  email: string
  cpf?: string | null
  telefone?: string | null
  data_nascimento?: string | null
  classificacao?: string | null
  matricula_externa?: string | null
  created_at?: string | null
}

/** Edita as informações de um estudante (perfil). */
export async function editarEstudanteAction(id: string, data: EditarEstudanteData) {
  if (!(await checkPermission('estudantes:update'))) return { error: 'Você não tem permissão para editar estudantes.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido. Verifique o acesso.' }

  const nome = data.nome?.trim()
  const email = data.email?.trim()
  if (!nome) return { error: 'Informe o nome.' }
  if (!email) return { error: 'Informe o e-mail.' }

  const svc = createAdminClient()
  const { data: antes } = await svc
    .from('simulado_estudantes')
    .select('nome, email, cpf, telefone, data_nascimento, classificacao, matricula_externa, created_at')
    .eq('id', id).eq('tenant_id', tenantId).maybeSingle()

  const update: Record<string, unknown> = {
    nome,
    email,
    cpf: data.cpf?.trim() || null,
    telefone: data.telefone?.trim() || null,
    data_nascimento: data.data_nascimento || null,
    classificacao: data.classificacao || null,
    matricula_externa: data.matricula_externa?.trim() || null,
  }
  // Só altera a data de cadastro se foi informada (evita sobrescrever com vazio).
  if (data.created_at) update.created_at = data.created_at

  const { error } = await svc.from('simulado_estudantes').update(update).eq('id', id).eq('tenant_id', tenantId)
  if (error) return { error: error.message }

  // Passaporte → entra automaticamente no grupo "Passaporte" (organização/filtro dos acessos).
  // Idempotente: só insere se ainda não for membro. Não bloqueia o salvamento se falhar.
  if ((data.classificacao || null) === 'passaporte') {
    try {
      const { data: gp } = await svc.from('simulado_grupos')
        .select('id').eq('tenant_id', tenantId).eq('deletado', false).eq('is_mestre', false).ilike('nome', 'passaporte').limit(1).maybeSingle()
      if (gp?.id) {
        const { data: ja } = await svc.from('simulado_grupo_membros').select('id').eq('grupo_id', gp.id).eq('estudante_id', id).limit(1).maybeSingle()
        if (!ja) await svc.from('simulado_grupo_membros').insert({ tenant_id: tenantId, grupo_id: gp.id, estudante_id: id })
      }
    } catch { /* não falha o salvamento por causa do grupo */ }
  }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_estudantes', entidadeId: id, antes, depois: update })
  revalidatePath(`/admin/estudantes/${id}`)
  revalidatePath('/admin/estudantes')
  return { ok: true }
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
