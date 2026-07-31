import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenant } from '@/lib/tenant'
import { getSessaoAluno } from '@/lib/aluno-session'
import { AlunoEntrarForm } from '@/components/aluno/aluno-entrar-form'
import { resolverLoginConfig } from '@/lib/login-config'

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

  const tema = (tenant?.tema ?? {}) as any
  return (
    <AlunoEntrarForm
      metodo={metodo}
      plataforma={tema.nome_site ?? tenant?.nome ?? 'Área do Aluno'}
      logo={tema.logo_url ?? null}
      subtitulo={tema.subtitulo_site ?? null}
      logoBg={tema.logo_png_bg ?? '#ffffff'}
      logoEstilo={tema.logo_estilo ?? 'arredondado'}
      config={resolverLoginConfig(tema.login)}
    />
  )
}
