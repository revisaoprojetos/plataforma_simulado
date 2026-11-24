'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, RefreshCw } from 'lucide-react'
import { reauditarIntegridade } from '../actions'

/** "Reauditar agora": descarta o cache (45 min) da auditoria e recalcula na próxima leitura (cronogramas:update). */
export function ReauditarBotao({ rotulo = 'Reauditar agora' }: { rotulo?: string } = {}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  function rodar() {
    iniciar(async () => {
      const r = await reauditarIntegridade()
      if (!r.ok) { toast.error(r.error || 'Falha ao reauditar.'); return }
      router.refresh() // a página recalcula (pode levar alguns segundos)
    })
  }
  return (
    <button type="button" onClick={rodar} disabled={pendente}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50">
      {pendente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      {pendente ? 'Reauditando…' : rotulo}
    </button>
  )
}
