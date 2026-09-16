'use client'

import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import { TRILHA_FORMATOS, type TrilhaFormato } from '@/lib/gamificacao/trilha-formato'

const P = 'var(--primary)'

/** Mini-ilustração de cada formato (esquemática) — dá a ideia sem renderizar a trilha real. */
function MiniPreview({ id }: { id: TrilhaFormato }) {
  if (id === 'reta') {
    return (
      <svg viewBox="0 0 120 72" className="h-full w-full">
        <line x1="60" y1="8" x2="60" y2="64" stroke="var(--border)" strokeWidth="3" strokeDasharray="2 5" strokeLinecap="round" />
        {[14, 36, 58].map((y, i) => <circle key={y} cx="60" cy={y} r="7" fill={i === 0 ? '#10b981' : i === 1 ? P : 'var(--muted)'} stroke={i === 1 ? P : 'transparent'} />)}
      </svg>
    )
  }
  if (id === 'mapa_semanas') {
    // Trilha horizontal: vai p/ direita, curva no fim e volta.
    return (
      <svg viewBox="0 0 120 72" className="h-full w-full">
        <path d="M18 24 H92 Q104 24 104 40 Q104 50 92 50 H40" fill="none" stroke="var(--border)" strokeWidth="3" strokeDasharray="2 5" strokeLinecap="round" />
        <circle cx="18" cy="24" r="6" fill="#10b981" />
        <circle cx="55" cy="24" r="7" fill={P} stroke={P} />
        <circle cx="92" cy="24" r="6" fill="var(--muted)" />
        <rect x="35" y="45" width="11" height="11" rx="2.5" fill="#f0b000" />
      </svg>
    )
  }
  if (id === 'lista') {
    return (
      <div className="flex h-full w-full flex-col justify-center gap-1.5 px-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: i === 0 ? '#10b981' : i === 1 ? P : 'var(--muted)' }} />
            <span className="h-2 flex-1 rounded bg-muted-foreground/25" />
            <span className="h-2 w-4 rounded" style={{ background: i === 1 ? P : 'var(--muted-foreground)', opacity: i === 1 ? 1 : 0.3 }} />
          </div>
        ))}
      </div>
    )
  }
  // serpentina
  return (
    <svg viewBox="0 0 120 72" className="h-full w-full">
      <path d="M24 16 Q84 16 84 36 Q84 56 36 56" fill="none" stroke="var(--border)" strokeWidth="3" strokeDasharray="2 5" strokeLinecap="round" />
      <circle cx="24" cy="16" r="7" fill="#10b981" />
      <circle cx="84" cy="36" r="7" fill={P} stroke={P} />
      <circle cx="36" cy="56" r="6" fill="var(--muted)" />
    </svg>
  )
}

export function FormatoSelector({ value, onChange, disabled }: {
  value: TrilhaFormato
  onChange: (v: TrilhaFormato) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {TRILHA_FORMATOS.map((f) => {
        const on = value === f.id
        return (
          <button key={f.id} type="button" disabled={disabled} onClick={() => onChange(f.id)}
            className={cn('flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors disabled:opacity-50',
              on ? 'border-primary/50 bg-primary/[0.06]' : 'hover:bg-muted/50')}>
            <div className="h-[72px] w-full overflow-hidden rounded-lg border bg-muted/30">
              <MiniPreview id={f.id} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{f.nome}</span>
              {on && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"><Check className="h-3.5 w-3.5" /> ativo</span>}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">{f.desc}</p>
          </button>
        )
      })}
    </div>
  )
}
