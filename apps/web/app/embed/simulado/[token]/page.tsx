import { resolveTemaDark } from '@/lib/hud/resolve-dark'
import { createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { EmbedLoginForm } from '@/components/embed/embed-login-form'
import { EmbedProvaRunner } from '@/components/embed/embed-prova-runner'
import { AlertCircle } from 'lucide-react'
import { type HudCores, type HudPorPagina, type LoginLayout, efetivarHud } from '@/lib/caderno-designer/types'
import { hudCssVars } from '@/lib/caderno-designer/hud'
import { resolverHudConfig } from '@/lib/hud/resolve-hud'

interface PageProps {
  params: Promise<{ token: string }>
  searchParams: Promise<{ sessao_id?: string }>
}

export default async function EmbedSimuladoPage({ params, searchParams }: PageProps) {
  const { token } = await params
  const { sessao_id } = await searchParams

  const simulado = await fetchSimuladoPorToken(token)

  if (!simulado) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center space-y-3">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="text-base font-semibold">Simulado não encontrado</h2>
          <p className="text-sm text-muted-foreground">
            O link de acesso é inválido ou o simulado não está disponível.
          </p>
        </div>
      </div>
    )
  }

  if (!simulado.embed_ativo) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center space-y-3">
          <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="text-base font-semibold">Acesso por embed desativado</h2>
          <p className="text-sm text-muted-foreground">
            Este simulado não está disponível via embed no momento.
          </p>
        </div>
      </div>
    )
  }

  const metodo = (simulado.metodo_identificacao ?? 'email_cpf') as
    | 'email'
    | 'email_cpf'
    | 'email_telefone'

  // Cores + marca do caderno vinculado — login e prova seguem o designer (cores próprias por página).
  const hud = await fetchHudCores(simulado.id)
  const branding = await fetchBranding(simulado.tenant_id)

  // Etapa 2: sessão já existe — mostrar runner (cores da página "prova")
  if (sessao_id) {
    return (
      <div className="min-h-screen bg-background" style={hudCssVars(efetivarHud(hud.base, hud.porPagina, 'prova')) as React.CSSProperties}>
        <EmbedProvaRunner
          embedToken={token}
          sessaoId={sessao_id}
          simuladoTitulo={simulado.titulo}
          branding={branding}
        />
      </div>
    )
  }

  // Etapa 1: identificação (o EmbedLoginForm aplica o tema da página "login" + claro/escuro)
  const dark = await resolveTemaDark()
  return (
    <EmbedLoginForm
      token={token}
      metodo={metodo}
      simuladoTitulo={simulado.titulo}
      branding={branding}
      darkInicial={dark}
      loginLayout={hud.loginLayout}
      hud={{ base: hud.base, porPagina: hud.porPagina }}
      prova={{
        status: simulado.status,
        dataInicio: simulado.data_inicio,
        dataFim: simulado.data_fim,
        tempoLimiteMin: simulado.tempo_limite_min,
      }}
    />
  )
}

/** Marca do tenant (logo + nome) para login/prova seguirem a configuração. */
async function fetchBranding(tenantId: string) {
  try {
    const svc = createAdminClient()
    const { data: t } = await svc.from('simulado_tenants').select('nome, tema').eq('id', tenantId).maybeSingle()
    const tema = (t?.tema ?? {}) as any
    return {
      nome: tema.nome_site ?? t?.nome ?? 'Simulado',
      logoUrl: (tema.logo_url ?? null) as string | null,
      logoGrandeUrl: (tema.logo_grande_url ?? null) as string | null,
      logoBg: (tema.logo_png_bg ?? '#ffffff') as string,
      logoEstilo: (tema.logo_estilo ?? 'arredondado') as string,
    }
  } catch {
    return null
  }
}

async function fetchSimuladoPorToken(embedToken: string): Promise<{
  id: string
  titulo: string
  embed_ativo: boolean
  metodo_identificacao: string | null
  tenant_id: string
  status: string | null
  data_inicio: string | null
  data_fim: string | null
  tempo_limite_min: number | null
} | null> {
  try {
    const supabase = await createServiceClient()
    const { data } = await supabase
      .from('simulado_simulados')
      .select('id, titulo, embed_ativo, metodo_identificacao, tenant_id, status, data_inicio, data_fim, tempo_limite_min')
      .eq('embed_token', embedToken)
      .single()

    return data ?? null
  } catch {
    return null
  }
}

/** Cores do HUD do caderno vinculado ao simulado (link explícito ou banco). Fallback p/ o padrão. */
async function fetchHudCores(simuladoId: string): Promise<{ base: HudCores; porPagina: HudPorPagina; loginLayout: LoginLayout }> {
  const { base, porPagina, loginLayout } = await resolverHudConfig(simuladoId)
  return { base, porPagina, loginLayout }
}
