'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Sparkles } from 'lucide-react'
import { garantirBancoSimuladoAction } from '@/app/admin/simulados/actions'

/**
 * Gate das abas de conteúdo do simulado: alguns simulados antigos/avulsos ainda não têm um banco
 * container (onde moram questões/HUD/caderno/grupos/visual). Este CTA cria + faz o backfill sob
 * demanda e recarrega. Simulados criados pelo wizard já nascem com banco → este CTA nem aparece.
 */
export function PrepararConteudoSimulado({ simuladoId, titulo = 'Preparar conteúdo', cta = 'Preparar agora', descricao }: { simuladoId: string; titulo?: string; cta?: string; descricao?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function preparar() {
    start(async () => {
      const r = await garantirBancoSimuladoAction(simuladoId)
      if (r.ok) { toast.success('Conteúdo preparado'); router.refresh() } else toast.error(r.error ?? 'Falha ao preparar.')
    })
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-muted/30 px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></span>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <p className="mx-auto max-w-md text-xs text-muted-foreground">
          {descricao ?? 'Este simulado ainda não tem um espaço de conteúdo próprio. Prepare-o para editar capa, cor, cadernos e demais configurações aqui mesmo.'}
        </p>
      </div>
      <button type="button" onClick={preparar} disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} {cta}
      </button>
    </div>
  )
}
