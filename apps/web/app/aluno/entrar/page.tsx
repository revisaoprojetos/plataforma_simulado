import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenant } from '@/lib/tenant'
import { getSessaoAluno } from '@/lib/aluno-session'
import { AlunoEntrarForm } from '@/components/aluno/aluno-entrar-form'

export default async function AlunoEntrarPage() {
  // Já logado → vai pro portal.
  if (await getSessaoAluno()) redirect('/aluno')

  const tenant = await getCurrentTenant()
  let metodo: 'email' | 'email_cpf' | 'email_telefone' = 'email'
  if (tenant) {
    const svc = await createServiceClient()
    const { data } = await svc
      .from('simulado_embed_config')
      .select('metodo_identificacao')
      .eq('tenant_id', tenant.id)
      .maybeSingle()
    if (data?.metodo_identificacao) metodo = data.metodo_identificacao as typeof metodo
  }

  return <AlunoEntrarForm metodo={metodo} plataforma={tenant?.nome ?? 'Área do Aluno'} />
}
