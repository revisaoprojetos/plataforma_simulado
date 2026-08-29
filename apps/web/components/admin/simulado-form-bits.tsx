'use client'

// Peças de formulário compartilhadas entre o SimuladoWizard e a nova criação página-por-página.
// Mesma linguagem visual (copiadas do wizard para não acoplar/arriscar o fluxo antigo).
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'

export function Secao({ icon: Icon, titulo, desc, tone = 'accent' }: { icon: React.ComponentType<{ className?: string }>; titulo: string; desc?: string; tone?: 'accent' | 'info' | 'ok' | 'warn' }) {
  const tones = {
    accent: 'bg-primary/10 text-primary',
    info: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
    ok: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    warn: 'bg-amber-500/15 text-amber-600 dark:text-amber-500',
  }
  return (
    <div className="flex items-center gap-3">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tones[tone])}><Icon className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0">
        <p className="text-[15px] font-bold leading-tight">{titulo}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
    </div>
  )
}

export function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{children}</span>
}

export function Campo({ label, obrigatorio, hint, children }: { label: string; obrigatorio?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <Rotulo>{label} {obrigatorio && <span className="text-destructive">*</span>}</Rotulo>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  )
}

export function ToggleRow({ label, desc, v, on, dim }: { label: string; desc?: string; v: boolean; on: (v: boolean) => void; dim?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-3 transition-colors', v ? 'border-primary/50 bg-primary/5' : 'bg-muted/30', dim && 'opacity-50')}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold">{label}</p>
        {desc && <p className="text-[11px] text-muted-foreground">{desc}</p>}
      </div>
      <Switch checked={!!v} onCheckedChange={on} />
    </div>
  )
}

export function SegCard({ label, hint, value, onChange, options }: { label: string; hint?: string; value: string; onChange: (v: string) => void; options: { v: string; label: string }[] }) {
  return (
    <div className="grid gap-2 rounded-xl border bg-muted/20 p-3">
      <span className="text-[12.5px] font-bold">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value === o.v
          return (
            <button key={o.v} type="button" onClick={() => onChange(o.v)}
              className={cn('h-7 rounded-lg border px-2.5 text-xs font-bold transition-colors',
                on ? 'border-transparent bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
              {o.label}
            </button>
          )
        })}
      </div>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  )
}

export const LIB_OPTS = [
  { v: 'imediato', label: 'Imediato' },
  { v: 'apos_janela', label: 'Após janela' },
  { v: 'manual', label: 'Manual' },
]
