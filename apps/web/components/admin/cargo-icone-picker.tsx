'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CARGO_ICONES, iconeCargo } from '@/lib/gamificacao/cargo-icones'
import { cn } from '@/lib/utils'

const W = 232 // largura do popover (~14.5rem)
const H = 288 // altura máx. aproximada (lista rola internamente)

/** Botão que mostra o ícone atual do cargo e abre uma grade para escolher outro.
 *  Renderiza em PORTAL com posição fixa (abre p/ cima se não couber embaixo) — assim não é cortado
 *  pelo container rolável da lista de cargos, e clicar fora/rolar/ESC fecha. */
export function CargoIconePicker({ value, onChange, disabled }: { value?: string; onChange: (k: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const Atual = iconeCargo(value)

  useEffect(() => {
    if (!open) return
    const posicionar = () => {
      const b = btnRef.current?.getBoundingClientRect()
      if (!b) return
      const left = Math.max(8, Math.min(b.left, window.innerWidth - W - 8))
      const abaixo = b.bottom + 6
      const top = abaixo + H > window.innerHeight ? Math.max(8, b.top - 6 - H) : abaixo
      setPos({ left, top })
    }
    posicionar()
    const onScroll = (e: Event) => { if (popRef.current?.contains(e.target as Node)) return; posicionar() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', posicionar)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', posicionar)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button ref={btnRef} type="button" disabled={disabled} onClick={() => setOpen((v) => !v)} aria-label="Escolher ícone do cargo"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition hover:bg-primary/20 disabled:opacity-60">
        <Atual className="h-5 w-5" />
      </button>
      {open && !disabled && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} />
          <div ref={popRef} style={{ left: pos.left, top: pos.top, width: W }}
            className="fixed z-[201] grid max-h-[17rem] grid-cols-6 gap-1 overflow-y-auto rounded-xl border bg-popover p-2 shadow-xl duration-150 animate-in fade-in-0 zoom-in-95">
            {CARGO_ICONES.map(({ key, label, Icon }) => (
              <button key={key} type="button" title={label} onClick={() => { onChange(key); setOpen(false) }}
                className={cn('flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-muted',
                  value === key ? 'bg-primary/15 text-primary ring-1 ring-primary' : 'text-muted-foreground')}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
