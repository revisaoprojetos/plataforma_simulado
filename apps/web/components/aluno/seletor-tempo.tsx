'use client'

import { useState } from 'react'
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
  const stepH = (d: number) => setH((v) => (v + d + 13) % 13) // 0..12h
  const stepM = (d: number) => setM((v) => (v + d + 60) % 60) // passo de 5min

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
            <div className={cn('mt-5 flex items-center justify-center gap-3 transition-opacity', semLimite && 'pointer-events-none opacity-40')}>
              <Roda valor={h} onUp={() => stepH(1)} onDown={() => stepH(-1)} label="horas" />
              <span className="pb-5 text-3xl font-bold text-muted-foreground">:</span>
              <Roda valor={m} onUp={() => stepM(5)} onDown={() => stepM(-5)} label="minutos" />
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

function Roda({ valor, onUp, onDown, label }: { valor: number; onUp: () => void; onDown: () => void; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <button type="button" onClick={onUp} aria-label={`Aumentar ${label}`} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronUp className="h-5 w-5" /></button>
      <div className="flex h-16 w-16 items-center justify-center rounded-xl border bg-muted/40 text-3xl font-bold tabular-nums tracking-tight">{String(valor).padStart(2, '0')}</div>
      <button type="button" onClick={onDown} aria-label={`Diminuir ${label}`} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronDown className="h-5 w-5" /></button>
      <span className="mt-1 text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
