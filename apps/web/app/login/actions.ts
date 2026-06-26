'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'

export async function loginAction(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  await registrarAudit({ operacao: 'LOGIN', entidade: 'auth', atorTipo: 'usuario', atorId: data.user?.id ?? null, depois: { email } })

  revalidatePath('/', 'layout')
  redirect('/admin')
}

/** Registra auditoria de LOGIN. Chamada pelo form client-side após o signIn. */
export async function registrarLoginAudit() {
  await registrarAudit({ operacao: 'LOGIN', entidade: 'auth', atorTipo: 'usuario', depois: {} })
}

export async function logoutAction() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  await registrarAudit({ operacao: 'LOGOUT', entidade: 'auth', atorTipo: 'usuario', atorId: data.user?.id ?? null })
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
