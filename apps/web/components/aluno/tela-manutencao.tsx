'use client'

import { useEffect } from 'react'
import { Wrench } from 'lucide-react'
import { isoParaBrtLocal } from '@/lib/brt'

function fmtFim(iso: string): string {
  const s = isoParaBrtLocal(iso)
  if (!s) return ''
  const [d, t] = s.split('T'); const [y, mo, da] = d.split('-')
  return `${da}/${mo}/${y} às ${t}`
}

/** Tela cheia de manutenção do portal; volta sozinha quando a manutenção termina. */
export function TelaManutencao({ titulo, mensagem, fim }: { titulo: string; mensagem: string; fim: string | null }) {
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch('/api/sistema/manutencao', { cache: 'no-store' })
        if (r.ok) { const j = await r.json(); if (!j.agora) window.location.reload() }
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 30000)
    return () => clearInterval(id)
  }, [])

  const fimLabel = fim ? fmtFim(fim) : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted/30 p-6">
      <div className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
          <Wrench className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold">{titulo}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{mensagem}</p>
        {fimLabel && <p className="text-sm">Previsão de retorno: <b>{fimLabel}</b></p>}
        <p className="text-xs text-muted-foreground">Esta página volta sozinha assim que a manutenção terminar.</p>
      </div>
    </div>
  )
}
