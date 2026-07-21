'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { removerCorrecao } from '@/app/admin/simulados/recorrecao-actions'

/** Botão de remover correção (com confirmação inline). */
export function RemoverCorrecaoButton({ simuladoId, questaoId }: { simuladoId: string; questaoId: string }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [pending, start] = useTransition()

  function remover() {
    start(async () => {
      const r = await removerCorrecao(simuladoId, questaoId)
      if (r.ok) {
        toast.success(r.processando
          ? `Correção removida — re-correção de ${r.afetados ?? 0} sessões em processamento (atualize em instantes).`
          : `Correção removida — ${r.afetados ?? 0} sessão(ões) re-corrigida(s)`)
        setConfirmando(false)
        router.refresh()
      } else {
        toast.error(r.error ?? 'Erro ao remover.')
      }
    })
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        title="Remover correção"
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" disabled={pending} onClick={remover} title="Confirmar remoção"
        className="rounded-md bg-destructive p-1.5 text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
      <button type="button" disabled={pending} onClick={() => setConfirmando(false)} title="Cancelar"
        className="rounded-md border p-1.5 text-muted-foreground transition-colors hover:bg-muted">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
