import { resolveTemaDark } from '@/lib/hud/resolve-dark'
import { createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { resolverHudConfig } from '@/lib/hud/resolve-hud'
import { HUD_CORES_PADRAO, type HudCores, type HudPorPagina } from '@/lib/caderno-designer/types'
import { EmbedLoginForm } from '@/components/embed/embed-login-form'
import { AlertCircle } from 'lucide-react'
import { ProvaClient } from './prova-client'

// Página cheia da prova (acesso pelo portal do aluno ou por link direto).
// - Sem `?st=`: mostra a tela de identificação (branded) que, ao validar, redireciona
//   para `?st=<sessao>` — assim o aluno vê o login/carregamento com a marca do tenant.
// - Com `?st=`: renderiza o runner, com o HUD do caderno resolvido no servidor (sem flash).
export default async function ProvaPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ st?: string }> }) {
  const { token } = await params
  const { st } = await searchParams

  const sim = await fetchSimulado(token)
  const dark = await resolveTemaDark()

  // HUD (cores/estilo por página) do caderno vinculado — login e prova seguem o designer.
  let base: HudCores = HUD_CORES_PADRAO
  let porPagina: HudPorPagina = {}
  if (sim) {
    try {
      const hud = await resolverHudConfig(sim.id, sim.tenant_id)
      base = hud.base
      porPagina = hud.porPagina
    } catch { /* fallback padrão */ }
  }
  const branding = sim ? await fetchBranding(sim.tenant_id) : null

  // Sem sessão na URL → identificação branded (login por e-mail/CPF/telefone).
  if (!st) {
    if (!sim) return <SimuladoNaoEncontrado />
    const metodo = (sim.metodo_identificacao ?? 'email') as 'email' | 'email_cpf' | 'email_telefone'
    return (
      <EmbedLoginForm
        token={token}
        metodo={metodo}
        simuladoTitulo={sim.titulo}
        branding={branding}
        destino="simulado"
        darkInicial={dark}
        hud={{ base, porPagina }}
        prova={{ status: sim.status, dataInicio: sim.data_inicio, dataFim: sim.data_fim, tempoLimiteMin: sim.tempo_limite_min }}
      />
    )
  }

  // Com sessão → runner temado.
  const brandingSimples = branding
    ? { logoUrl: branding.logoUrl, logoBg: branding.logoBg, logoEstilo: branding.logoEstilo }
    : null
  return <ProvaClient token={token} hudInicial={{ base, porPagina, branding: brandingSimples }} darkInicial={dark} />
}

function SimuladoNaoEncontrado() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="space-y-3 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <h2 className="text-base font-semibold">Simulado não encontrado</h2>
        <p className="text-sm text-muted-foreground">O link de acesso é inválido ou o simulado não está disponível.</p>
      </div>
    </div>
  )
}

async function fetchSimulado(embedToken: string): Promise<{
  id: string
  titulo: string
  metodo_identificacao: string | null
  tenant_id: string
  status: string | null
  data_inicio: string | null
  data_fim: string | null
  tempo_limite_min: number | null
} | null> {
  try {
    const svc = await createServiceClient()
    const { data } = await svc
      .from('simulado_simulados')
      .select('id, titulo, metodo_identificacao, tenant_id, status, data_inicio, data_fim, tempo_limite_min')
      .eq('embed_token', embedToken)
      .maybeSingle()
    return (data as any) ?? null
  } catch {
    return null
  }
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
