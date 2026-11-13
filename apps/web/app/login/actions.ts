'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { registrarAudit } from '@/lib/audit'
import { ipDeRequest, lockoutFalha, lockoutLimpar, lockoutRestante } from '@/lib/rate-limit'
import { emailSeguro } from '@/lib/seguranca/postgrest-safe'

export async function loginAction(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  // Lockout por IP+e-mail (Redis; 5 falhas/15 min → 15 min, reincidência 1 h/4 h). Fail-open.
  const chave = `adm:${ipDeRequest(await headers())}:${emailSeguro(email) ?? '-'}`
  const restante = await lockoutRestante(chave)
  if (restante > 0) redirect(`/login?error=${encodeURIComponent(`Muitas tentativas. Aguarde ${Math.ceil(restante / 60)} min.`)}`)

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    await lockoutFalha(chave)
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }
  await lockoutLimpar(chave)

  await registrarAudit({ operacao: 'LOGIN', entidade: 'auth', atorTipo: 'usuario', atorId: data.user?.id ?? null, depois: { email } })

  revalidatePath('/', 'layout')
  redirect('/admin')
}

/** Registra auditoria de LOGIN. Chamada pelo form client-side após o signIn. */
export async function registrarLoginAudit() {
  await registrarAudit({ operacao: 'LOGIN', entidade: 'auth', atorTipo: 'usuario', depois: {} })
}

export async function logoutAction() {
  // RESILIENTE: o logout NUNCA pode travar se o backend (Supabase) estiver lento/fora.
  // - getSession() lê o cookie LOCAL (sem round-trip), só p/ ter o ator da auditoria.
  // - auditoria é best-effort (fire-and-forget).
  // - signOut({ scope: 'local' }) limpa os cookies da sessão SEM chamar o servidor p/ revogar.
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } } as any))
    void registrarAudit({ operacao: 'LOGOUT', entidade: 'auth', atorTipo: 'usuario', atorId: data?.session?.user?.id ?? null }).catch(() => {})
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  } catch { /* nunca bloquear o logout */ }
  revalidatePath('/', 'layout')
  // Volta para a tela de login DESTA plataforma (mesmo host), como se cada empresa tivesse seu domínio.
  redirect('/aluno/entrar')
}
