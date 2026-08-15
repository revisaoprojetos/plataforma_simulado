'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { excluirMeuSimulado } from '@/app/aluno/(portal)/simulados/builder-actions'

/**
 * Botão "Excluir simulado" (personalizado) para a PARTE INTERNA — detalhe (ao lado de Editar)
 * e editor. Confirma, exclui e volta para a aba Personalizados. `iconOnly` = só o ícone (header).
 */
export function ExcluirPersonalizadoButton({ simuladoId, titulo, iconOnly = false, className }: {
  simuladoId: string
  titulo: string
  iconOnly?: boolean
  className?: string
}) {
  const router = useRouter()
  const [excluindo, setExcluindo] = useState(false)

  const onExcluir = async () => {
    const ok = await confirmar({ titulo: 'Excluir simulado', mensagem: `Excluir "${titulo}"? Isso não pode ser desfeito.`, confirmar: 'Excluir', destrutivo: true })
    if (!ok) return
    setExcluindo(true)
    const r = await excluirMeuSimulado(simuladoId)
    if (r.error) { toast.error(r.error); setExcluindo(false); return }
    toast.success('Simulado excluído.')
    router.push('/aluno/simulados?aba=personalizados')
  }

  return (
    <button type="button" onClick={onExcluir} disabled={excluindo} title="Excluir simulado"
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border text-destructive transition-colors hover:border-destructive/40 hover:bg-destructive/10 disabled:opacity-60',
        iconOnly ? 'p-2' : 'px-3 py-2 text-sm font-medium',
        className,
      )}>
      {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      {!iconOnly && <span className="hidden sm:inline">Excluir</span>}
    </button>
  )
}
