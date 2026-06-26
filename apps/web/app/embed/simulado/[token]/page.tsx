import { createServiceClient } from '@/lib/supabase/server'
import { EmbedLoginForm } from '@/components/embed/embed-login-form'
import { EmbedProvaRunner } from '@/components/embed/embed-prova-runner'
import { AlertCircle } from 'lucide-react'

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

  // Etapa 2: sessão já existe — mostrar runner
  if (sessao_id) {
    return (
      <EmbedProvaRunner
        embedToken={token}
        sessaoId={sessao_id}
        simuladoTitulo={simulado.titulo}
      />
    )
  }

  // Etapa 1: identificação
  return (
    <EmbedLoginForm
      token={token}
      metodo={metodo}
      simuladoTitulo={simulado.titulo}
    />
  )
}

async function fetchSimuladoPorToken(embedToken: string): Promise<{
  id: string
  titulo: string
  embed_ativo: boolean
  metodo_identificacao: string | null
} | null> {
  try {
    const supabase = await createServiceClient()
    const { data } = await supabase
      .from('simulado_simulados')
      .select('id, titulo, embed_ativo, metodo_identificacao')
      .eq('embed_token', embedToken)
      .single()

    return data ?? null
  } catch {
    return null
  }
}
