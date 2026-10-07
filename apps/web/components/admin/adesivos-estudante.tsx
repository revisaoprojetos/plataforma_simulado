'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Stamp, X } from 'lucide-react'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'

export interface AdesivoView {
  id: string
  url: string | null
  titulo: string
  texto: string | null
  modulo: string
  ganhoEm: string | null
}

type Hover = { a: AdesivoView; x: number; y: number }

function Tile({ a, fixo, onHover }: { a: AdesivoView; fixo?: boolean; onHover: (h: Hover | null) => void }) {
  const enter = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    onHover({ a, x: r.left + r.width / 2, y: r.top })
  }
  return (
    <div
      onMouseEnter={enter}
      onMouseLeave={() => onHover(null)}
      className={cn('flex flex-col items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-center', fixo && 'w-[92px] shrink-0')}
    >
      <div className="flex h-14 w-14 items-center justify-center">
        {a.url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={a.url} alt="" className="h-full w-full object-contain" />
          : <Stamp className="h-7 w-7 text-amber-500/60" />}
      </div>
      <span className="line-clamp-2 text-[11px] font-medium leading-tight">{a.titulo}</span>
      {a.modulo && <span className="line-clamp-1 max-w-full rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">{a.modulo}</span>}
    </div>
  )
}

/** Balão flutuante (portal) com as infos do adesivo — igual ao das conquistas, não cortado por overflow. */
function TooltipAdesivo({ h }: { h: Hover }) {
  if (typeof document === 'undefined') return null
  const x = Math.min(Math.max(h.x, 150), window.innerWidth - 150)
  return createPortal(
    <div className="pointer-events-none fixed z-[110] -translate-x-1/2 -translate-y-full" style={{ left: x, top: h.y - 10 }}>
      <div className="max-w-[260px] rounded-lg bg-foreground px-3 py-2 text-left text-xs text-background shadow-xl">
        <div className="font-semibold">{h.a.titulo}</div>
        {h.a.texto && <div className="mt-0.5 text-background/80">{h.a.texto}</div>}
        {h.a.modulo && <div className="mt-1 text-[10px] text-background/60">Módulo: {h.a.modulo}</div>}
        {h.a.ganhoEm && <div className="mt-0.5 text-[10px] text-background/60">Conquistado em {formatBrt(h.a.ganhoEm)}</div>}
      </div>
      <span className="mx-auto block h-2 w-2 -translate-y-1 rotate-45 bg-foreground" />
    </div>,
    document.body,
  )
}

/** Adesivos (carimbos) CONQUISTADOS pelo aluno — mesma pegada da coleção de conquistas: prévia em uma
 *  linha + contagem + "Ver todos" num pop-up. Entra abaixo das conquistas, no card de gamificação. */
export function AdesivosEstudante({ adesivos }: { adesivos: AdesivoView[] }) {
  const [aberto, setAberto] = useState(false)
  const [hover, setHover] = useState<Hover | null>(null)
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [aberto])

  if (!adesivos.length) return null

  return (
    <div className="border-t p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Stamp className="h-4 w-4 text-amber-500" /> Adesivos conquistados
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{adesivos.length}</span>
        </h3>
        {adesivos.length > 6 && (
          <button type="button" onClick={() => setAberto(true)}
            className="rounded-lg border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
            Ver todos
          </button>
        )}
      </div>

      {/* Prévia em uma linha; o excedente fica escondido e abre no pop-up. */}
      <div className="relative">
        <div className="flex gap-2 overflow-hidden">
          {adesivos.map((a) => <Tile key={a.id} a={a} fixo onHover={setHover} />)}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent" />
      </div>

      {hover && <TooltipAdesivo h={hover} />}

      {aberto && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setAberto(false)}>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Stamp className="h-4 w-4 text-amber-500" /> Adesivos conquistados <span className="text-xs font-normal text-muted-foreground">· {adesivos.length}</span></h3>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="overflow-y-auto p-5 [scrollbar-width:thin]">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {adesivos.map((a) => <Tile key={a.id} a={a} onHover={setHover} />)}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
