'use client'

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Clock, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** "05:00 hr" (HH:MM) ou "Sem limite" a partir de minutos (0/negativo = sem limite). */
export function formatarTempo(min: number): string {
  if (!min || min <= 0) return 'Sem limite'
  const h = Math.floor(min / 60), m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} hr`
}

/**
 * Seletor de tempo estilo despertador: mostra o valor atual; ao clicar abre um editor de
 * HORAS : MINUTOS com setas (↑/↓). Base padrão vem de fora (5h). 0 = sem limite.
 */
export function SeletorTempo({ minutos, onChange }: { minutos: number; onChange: (m: number) => void }) {
  const [aberto, setAberto] = useState(false)
  const [h, setH] = useState(Math.floor(minutos / 60))
  const [m, setM] = useState(minutos % 60)
  const [semLimite, setSemLimite] = useState(minutos <= 0)

  const abrir = () => { setH(Math.floor(minutos / 60)); setM(minutos % 60); setSemLimite(minutos <= 0); setAberto(true) }
  const aplicar = () => { onChange(semLimite ? 0 : h * 60 + m); setAberto(false) }

  return (
    <>
      <button type="button" onClick={abrir}
        className="inline-flex items-center gap-2 rounded-lg border bg-transparent px-3 py-2 text-sm font-medium transition-colors hover:bg-muted">
        <Clock className="h-4 w-4 text-muted-foreground" /> {formatarTempo(minutos)}
      </button>

      {aberto && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setAberto(false)}>
          <div className="w-full max-w-xs rounded-2xl border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-center text-sm font-semibold">Tempo do simulado</h3>
            <div className={cn('mt-4 flex items-center justify-center gap-2 transition-opacity', semLimite && 'pointer-events-none opacity-40')}>
              <Roda valor={h} max={12} onChange={setH} label="horas" />
              <span className="-mt-2 text-3xl font-bold text-muted-foreground">:</span>
              <Roda valor={m} max={59} onChange={setM} label="minutos" />
            </div>
            <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 text-sm">
              <input type="checkbox" checked={semLimite} onChange={(e) => setSemLimite(e.target.checked)} className="h-4 w-4 rounded border-muted-foreground/40 text-primary" />
              Sem limite de tempo
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAberto(false)} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">Cancelar</button>
              <button type="button" onClick={aplicar} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">Aplicar</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

const ITEM = 34 // altura de cada número (px)

/** Roda estilo despertador ARRASTÁVEL: número central grande + vizinhos esmaecidos com degradê.
 *  Arraste (toque/mouse) para rolar seguindo o dedo (com animação de snap ao soltar); role o mouse;
 *  ou use as setas ↑/↓. Horas 0–12, minutos 0–59 (com wrap). */
function Roda({ valor, max, onChange, label }: { valor: number; max: number; onChange: (v: number) => void; label: string }) {
  const wrap = (v: number) => ((v % (max + 1)) + (max + 1)) % (max + 1)
  const fmt = (v: number) => String(v).padStart(2, '0')
  const [drag, setDrag] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef(0)

  const onDown = (e: React.PointerEvent) => { setDragging(true); start.current = e.clientY; try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ok */ } }
  const onMove = (e: React.PointerEvent) => { if (dragging) setDrag(e.clientY - start.current) }
  const finish = () => {
    if (!dragging) return
    const passos = Math.round(drag / ITEM)
    if (passos) onChange(wrap(valor - passos))
    setDragging(false)
    setDrag(drag - passos * ITEM) // resíduo → anima suave até 0 (snap)
    requestAnimationFrame(() => requestAnimationFrame(() => setDrag(0)))
  }
  const passo = (d: number) => onChange(wrap(valor + d))
  const itens = [-3, -2, -1, 0, 1, 2, 3].map((o) => ({ o, v: wrap(valor + o) }))

  return (
    <div className="flex select-none flex-col items-center">
      <button type="button" onClick={() => passo(1)} aria-label={`Aumentar ${label}`} className="rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"><ChevronUp className="h-5 w-5" /></button>
      <div className="relative w-16 touch-none overflow-hidden" style={{ height: ITEM * 3, touchAction: 'none' }}
        role="spinbutton" aria-label={label} aria-valuenow={valor} aria-valuemin={0} aria-valuemax={max}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={finish} onPointerCancel={finish} onPointerLeave={finish}
        onWheel={(e) => passo(e.deltaY > 0 ? -1 : 1)}>
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 rounded-lg bg-primary/5 ring-1 ring-primary/25" style={{ height: ITEM }} />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-card via-card/85 to-transparent" style={{ height: ITEM }} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-card via-card/85 to-transparent" style={{ height: ITEM }} />
        <div className="absolute inset-0 flex flex-col items-center justify-center will-change-transform"
          style={{ transform: `translateY(${drag}px)`, transition: dragging ? 'none' : 'transform 240ms cubic-bezier(0.22,1,0.36,1)' }}>
          {itens.map(({ o, v }) => {
            const pos = o * ITEM + drag
            const dist = Math.abs(pos)
            const central = dist < ITEM / 2
            return (
              <div key={o} style={{ height: ITEM, opacity: Math.max(0.18, 1 - dist / 60) }}
                className={cn('flex items-center justify-center tabular-nums', central ? 'text-3xl font-bold text-foreground' : 'text-xl font-semibold text-muted-foreground')}>
                {fmt(v)}
              </div>
            )
          })}
        </div>
      </div>
      <button type="button" onClick={() => passo(-1)} aria-label={`Diminuir ${label}`} className="rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"><ChevronDown className="h-5 w-5" /></button>
      <span className="mt-1 text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
