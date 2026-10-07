'use client'

import { useEffect, useState, type ComponentType } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { ClipboardList, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PendenteGenerico {
  id: string
  titulo: string
  sub?: string | null
  href?: string | null
  iniciado?: boolean
}

/**
 * Chip compacto de "pendentes" para o CABEÇALHO dos cards (simulados/desafios feitos): mostra a
 * contagem e abre um pop-up com a lista completa. Não renderiza nada quando não há pendentes.
 */
export function PendentesChip({ pendentes, titulo, icon: Icon = ClipboardList }: {
  pendentes: PendenteGenerico[]
  titulo: string
  icon?: ComponentType<{ className?: string }>
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!pendentes.length) return null

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 transition hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 dark:text-amber-400"
        title={`${titulo} (${pendentes.length})`}>
        <Icon className="h-3.5 w-3.5" /> {pendentes.length} pendente(s)
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="animate-page absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" className="animate-pop relative flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/5 px-5 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-amber-500" /> {titulo} ({pendentes.length})</h3>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>
            <div className="scroll-claro mt-2 grid min-h-0 flex-1 gap-2 overflow-auto px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
              {pendentes.map((p) => {
                const inner = (
                  <>
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', p.iniciado ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.titulo}</span>
                      {p.sub && <span className="block truncate text-xs text-muted-foreground">{p.sub}</span>}
                    </span>
                  </>
                )
                return p.href
                  ? <Link key={p.id} href={p.href} className="flex items-center gap-3 rounded-xl border p-3 transition hover:border-primary hover:bg-primary/5">{inner}</Link>
                  : <div key={p.id} className="flex items-center gap-3 rounded-xl border p-3">{inner}</div>
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
