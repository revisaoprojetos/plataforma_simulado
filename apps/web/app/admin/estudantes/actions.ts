'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'

interface NovoEstudanteData {
  nome: string
  email: string
  cpf?: string
  telefone?: string
}

export async function createEstudanteAction(data: NovoEstudanteData) {
  const supabase = await createServiceClient()

  // Create auth user
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: data.email,
    email_confirm: true,
    user_metadata: { full_name: data.nome },
  })

  if (authError) {
    return { error: authError.message }
  }

  // Create estudante profile
  const { error: profileError } = await supabase.from('estudantes').insert({
    user_id: authUser.user.id,
    nome: data.nome,
    cpf: data.cpf || null,
    telefone: data.telefone || null,
  })

  if (profileError) {
    // Rollback: delete auth user
    await supabase.auth.admin.deleteUser(authUser.user.id)
    return { error: profileError.message }
  }

  revalidatePath('/admin/estudantes')
  redirect('/admin/estudantes')
}
