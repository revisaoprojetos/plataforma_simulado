'use client'
// 03b §2.6 — Pacotes de estudo que incluem o conteúdo. Pacotes são FASE POSTERIOR → stub HONESTO.

import { Package } from 'lucide-react'

export function AbaPacotes() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/30 px-6 py-12 text-center">
      <Package className="h-7 w-7 text-muted-foreground" aria-hidden />
      <div className="text-sm font-semibold text-foreground">Pacotes de estudo — fase posterior</div>
      <p className="mx-auto max-w-md text-xs text-muted-foreground">
        Os pacotes/extensivos (semanas, calendário, liberação por item) ainda não estão implementados. Quando entrarem, esta aba mostrará em quais pacotes o conteúdo está, a posição na semana, o alcance e a origem “Via pacote” em “Quem tem acesso”.
      </p>
    </div>
  )
}
