'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock } from 'lucide-react'
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
              <span className="pb-5 text-3xl font-bold text-muted-foreground">:</span>
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

/** Roda estilo despertador: número central grande + vizinhos esmaecidos (acima/abaixo) com
 *  degradê nas bordas. Toque num vizinho ou role a roda para mudar. */
function Roda({ valor, max, onChange, label }: { valor: number; max: number; onChange: (v: number) => void; label: string }) {
  const wrap = (v: number) => ((v % (max + 1)) + (max + 1)) % (max + 1)
  const fmt = (v: number) => String(v).padStart(2, '0')
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-36 w-16 select-none overflow-hidden" role="spinbutton" aria-label={label} aria-valuenow={valor} aria-valuemin={0} aria-valuemax={max}
        onWheel={(e) => onChange(wrap(valor + (e.deltaY > 0 ? 1 : -1)))}>
        {/* faixa do selecionado (centro) */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-11 -translate-y-1/2 rounded-lg bg-primary/5 ring-1 ring-primary/25" />
        {/* degradê topo/base */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 bg-gradient-to-b from-card via-card/85 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-12 bg-gradient-to-t from-card via-card/85 to-transparent" />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <button type="button" tabIndex={-1} onClick={() => onChange(wrap(valor - 2))} className="h-7 text-base font-medium tabular-nums text-muted-foreground/25">{fmt(wrap(valor - 2))}</button>
          <button type="button" tabIndex={-1} onClick={() => onChange(wrap(valor - 1))} className="h-8 text-xl font-semibold tabular-nums text-muted-foreground/55">{fmt(wrap(valor - 1))}</button>
          <div className="flex h-11 items-center text-3xl font-bold tabular-nums text-foreground">{fmt(valor)}</div>
          <button type="button" tabIndex={-1} onClick={() => onChange(wrap(valor + 1))} className="h-8 text-xl font-semibold tabular-nums text-muted-foreground/55">{fmt(wrap(valor + 1))}</button>
          <button type="button" tabIndex={-1} onClick={() => onChange(wrap(valor + 2))} className="h-7 text-base font-medium tabular-nums text-muted-foreground/25">{fmt(wrap(valor + 2))}</button>
        </div>
      </div>
      <span className="mt-1 text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
