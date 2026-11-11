'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, Check, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'

// Pequenas peças de apresentação/ação compartilhadas pelas telas de Cursos (só UI; nenhum cálculo de negócio).

export const inputCls =
  'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60'
export const textareaCls =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

/** Executa uma server action com toast e refresh. Devolve [pendente, executar]. */
export function useAcao() {
  const router = useRouter()
  const [pendente, start] = useTransition()
  function executar<T extends { ok: true } | { error: string }>(fn: () => Promise<T>, okMsg?: string, depois?: (r: T) => void) {
    start(async () => {
      const r = await fn()
      if ('error' in r) { toast.error(r.error); return }
      if (okMsg) toast.success(okMsg)
      depois?.(r)
      router.refresh()
    })
  }
  return [pendente, executar] as const
}

export function Nota({ tipo = 'info', children, className }: { tipo?: 'info' | 'gold' | 'ok'; children: React.ReactNode; className?: string }) {
  const Icon = tipo === 'ok' ? Check : tipo === 'gold' ? AlertTriangle : Info
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm',
        tipo === 'gold' ? 'bg-amber-500/10 text-foreground' : tipo === 'ok' ? 'bg-emerald-500/10 text-foreground' : 'bg-muted text-foreground',
        className,
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', tipo === 'gold' ? 'text-amber-600 dark:text-amber-400' : tipo === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary')} />
      <span>{children}</span>
    </div>
  )
}

export function Pill({ tom = 'mut', children }: { tom?: 'ok' | 'warn' | 'mut' | 'vio'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tom === 'ok' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
        tom === 'warn' && 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
        tom === 'vio' && 'bg-primary/10 text-primary',
        tom === 'mut' && 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}

export function Campo({ rotulo, dica, children, className }: { rotulo: string; dica?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-semibold">{rotulo}</span>
      {children}
      {dica && <small className="text-xs text-muted-foreground">{dica}</small>}
    </label>
  )
}

export function ToggleRow({ checked, onChange, children, disabled, rotulo }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; disabled?: boolean; rotulo?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={rotulo ?? (typeof children === 'string' ? children : undefined)} />
      <span>{children}</span>
    </div>
  )
}

export function Chip({ on, onClick, children, disabled, className }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60',
        on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {on && <Check className="size-3.5" />}
      {children}
    </button>
  )
}
