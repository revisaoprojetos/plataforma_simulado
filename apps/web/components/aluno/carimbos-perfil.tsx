'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Stamp, X } from 'lucide-react'
import type { CarimboDef } from '@/lib/leitura/carimbos-tipos'

export type CarimboPerfilView = { def: CarimboDef; modulo: string; ganhoEm: string | null }

/** Registro dos ADESIVOS coletados no perfil — modelo das conquistas. Clique = expandir (ver maior).
 *  A decoração (colocar no header) é editada direto no card do perfil (PerfilAdesivosLayer). */
export function CarimbosPerfil({ carimbos }: { carimbos: CarimboPerfilView[] }) {
  const [expandido, setExpandido] = useState<CarimboPerfilView | null>(null)
  if (!carimbos.length) return null

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400"><Stamp className="h-4 w-4" /></span>
        <h3 className="text-sm font-semibold">Adesivos</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{carimbos.length}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">Clique para ampliar · decore seu card no topo</span>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {carimbos.map((c, i) => (
          <button key={`${c.def.id}:${i}`} type="button" onClick={() => setExpandido(c)} title={`${c.def.titulo} — ver maior`}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-center transition-transform hover:scale-[1.03] hover:border-amber-500/50">
            <div className="flex h-16 w-16 items-center justify-center">
              {c.def.url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={c.def.url} alt="" className="h-full w-full object-contain" />
                : <Stamp className="h-8 w-8 text-muted-foreground/50" />}
            </div>
            <span className="line-clamp-2 text-xs font-semibold leading-tight">{c.def.titulo}</span>
            <span className="line-clamp-1 max-w-full rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">{c.modulo}</span>
          </button>
        ))}
      </div>

      {/* Lightbox — ver o adesivo maior */}
      {expandido && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={() => setExpandido(null)}>
          <div className="relative flex max-h-[85vh] w-full max-w-sm flex-col items-center gap-4 rounded-2xl border bg-card p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setExpandido(null)} aria-label="Fechar" className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            <div className="flex h-52 w-52 items-center justify-center">
              {expandido.def.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={expandido.def.url} alt="" className="h-full w-full object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,.35)]" />
              )}
            </div>
            <div>
              <h4 className="text-base font-bold">{expandido.def.titulo}</h4>
              {expandido.def.texto && <p className="mt-1 text-sm text-muted-foreground">{expandido.def.texto}</p>}
              <p className="mt-2 inline-block rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">{expandido.modulo}</p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
