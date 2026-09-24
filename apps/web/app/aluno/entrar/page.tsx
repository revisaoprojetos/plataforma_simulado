import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenant } from '@/lib/tenant'
import { getSessaoAluno } from '@/lib/aluno-session'
import { AlunoEntrarForm } from '@/components/aluno/aluno-entrar-form'
import { resolverLoginConfig } from '@/lib/login-config'

export default async function AlunoEntrarPage({ searchParams }: { searchParams: Promise<{ redirectTo?: string }> }) {
  // Destino original (ex.: pasta de simulados enviada ao estudante) — validado p/ caminho do aluno.
  const sp = await searchParams
  const rt = sp.redirectTo && /^\/(aluno|simulado)(\/|$|\?)/.test(sp.redirectTo) ? sp.redirectTo : null
  // Já logado → vai direto pro destino (ou portal).
  if (await getSessaoAluno()) redirect(rt ?? '/aluno')

  const tenant = await getCurrentTenant()
  let metodo: 'email' | 'email_cpf' | 'email_telefone' = 'email'
  if (tenant) {
    const svc = createAdminClient()
    const { data } = await svc
      .from('simulado_embed_config')
      .select('metodo_identificacao')
      .eq('tenant_id', tenant.id)
      .maybeSingle()
    if (data?.metodo_identificacao) metodo = data.metodo_identificacao as typeof metodo
  }

  const tema = (tenant?.tema ?? {}) as any
  // Cor da marca DO TENANT usada DIRETO (hex) no login — sem depender do var(--primary), que pode
  // cair no padrão (roxo) do globals se o CSS do tema não vencer a especificidade. Garante que a
  // tela de entrada de CADA plataforma use a própria cor, sem "pegar" a de outro tenant.
  const corMarca = tema.cor_primaria ?? tema?.cores?.btn ?? null
  const corDest = tema.cor_accent ?? tema?.cores?.accent ?? corMarca
  const config = resolverLoginConfig(tema.login)
  if (corMarca && !config.corPrimaria) config.corPrimaria = corMarca
  if (corDest && !config.corAccent) config.corAccent = corDest
  return (
    <AlunoEntrarForm
      metodo={metodo}
      plataforma={tema.nome_site ?? tenant?.nome ?? 'Área do Aluno'}
      logo={tema.logo_url ?? null}
      subtitulo={tema.subtitulo_site ?? null}
      logoBg={tema.logo_png_bg ?? '#ffffff'}
      logoEstilo={tema.logo_estilo ?? 'arredondado'}
      logoFiltro={tema.logo_filtro_sistema ?? tema.logo_filtro ?? 'none'}
      config={config}
    />
  )
}
