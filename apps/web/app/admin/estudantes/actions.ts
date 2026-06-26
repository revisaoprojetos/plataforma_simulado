'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

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
