'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/** Auditoria rodando em segundo plano: reconsulta a página a cada 6 s até o resultado chegar (sem skeleton infinito). */
export function AutoAtualizar({ desde }: { desde: number }) {
  const router = useRouter()
  // Backoff 6 s → 30 s, pausa com a aba oculta e desiste após ~10 min (cada refresh re-renderiza a página no servidor).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    let espera = 6000
    const ini = Date.now()
    const tick = () => {
      if (Date.now() - ini > 10 * 60 * 1000) return
      if (!document.hidden) router.refresh()
      espera = Math.min(30_000, Math.round(espera * 1.3))
      t = setTimeout(tick, espera)
    }
    t = setTimeout(tick, espera)
    return () => { if (t) clearTimeout(t) }
  }, [router])
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
      <span>Auditando os planos em segundo plano (pode levar alguns minutos na primeira vez). Esta tela atualiza sozinha quando terminar — iniciada às {new Date(desde).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}.</span>
    </div>
  )
}
