import { resolveTemaDark } from '@/lib/hud/resolve-dark'
import { createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { EmbedLoginForm } from '@/components/embed/embed-login-form'
import { BookOpen } from 'lucide-react'
import { resolverHudConfig } from '@/lib/hud/resolve-hud'

interface PageProps {
  searchParams: Promise<{ token?: string }>
}

/** Aviso simples (sem token / simulado inexistente). */
function Aviso({ titulo, msg, erro }: { titulo: string; msg: string; erro?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="space-y-3 text-center">
        <BookOpen className={`mx-auto h-10 w-10 ${erro ? 'text-destructive' : 'text-muted-foreground'}`} />
        <h2 className="text-base font-semibold">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{msg}</p>
      </div>
    </div>
  )
}

async function fetchSimulado(token: string) {
  try {
    const svc = await createServiceClient()
    const { data } = await svc
      .from('simulado_simulados')
      .select('id, titulo, metodo_identificacao, tenant_id, status, data_inicio, data_fim, tempo_limite_min')
      .eq('embed_token', token)
      .single()
    return data ?? null
  } catch {
    return null
  }
}

async function fetchBranding(tenantId: string) {
  try {
    const svc = createAdminClient()
    const { data: t } = await svc.from('simulado_tenants').select('nome, tema').eq('id', tenantId).maybeSingle()
    const tema = (t?.tema ?? {}) as Record<string, string>
    return {
      nome: tema.nome_site ?? t?.nome ?? 'Simulado',
      logoUrl: tema.logo_url ?? null,
      logoGrandeUrl: tema.logo_grande_url ?? null,
      logoBg: tema.logo_png_bg ?? '#ffffff',
      logoEstilo: tema.logo_estilo ?? 'arredondado',
    }
  } catch {
    return null
  }
}

/**
 * Login do aluno para o simulado (página cheia). Mesmo visual/HUD do embed:
 * cores da página "login" do caderno vinculado, pop-ups por cima, e ao identificar
 * segue para /simulado/[token] com a animação de entrada.
 */
export default async function AlunoLoginPage({ searchParams }: PageProps) {
  const { token } = await searchParams

  if (!token) {
    return <Aviso titulo="Link de acesso ausente" msg="Use o link do simulado enviado pela sua plataforma." />
  }

  const simulado = await fetchSimulado(token)
  if (!simulado) {
    return <Aviso erro titulo="Simulado não encontrado" msg="O link de acesso é inválido ou o simulado não está disponível." />
  }

  const metodo = (simulado.metodo_identificacao ?? 'email_cpf') as 'email' | 'email_cpf' | 'email_telefone'
  const hud = await resolverHudConfig(simulado.id, simulado.tenant_id)
  const branding = await fetchBranding(simulado.tenant_id)
  const dark = await resolveTemaDark()

  return (
    <EmbedLoginForm
      token={token}
      destino="simulado"
      metodo={metodo}
      simuladoTitulo={simulado.titulo}
      branding={branding}
      darkInicial={dark}
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
