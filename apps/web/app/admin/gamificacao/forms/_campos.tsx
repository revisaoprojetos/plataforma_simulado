'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Save, type LucideIcon } from 'lucide-react'

/**
 * Campo numérico. Padrão: linha compacta (rótulo à esquerda, input à direita).
 * `stacked`: rótulo em cima e input embaixo (colunas estreitas, ex.: 3 na mesma linha).
 */
export function NumberField({ label, value, onChange, min = 0, step = 1, suffix, hint, disabled, stacked }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; step?: number; suffix?: string; hint?: string; disabled?: boolean; stacked?: boolean
}) {
  const input = (
    <Input type="number" inputMode="numeric" min={min} step={step} value={Number.isFinite(value) ? value : 0}
      disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} className={`${stacked ? 'w-full' : 'w-24'} text-right tabular-nums`} />
  )

  if (stacked) {
    return (
      <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <div className="mt-1.5 flex items-center gap-1.5">
          {input}
          {suffix && <span className="shrink-0 text-[11px] leading-tight text-muted-foreground">{suffix}</span>}
        </div>
        {hint && <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 px-3 py-2.5">
      <div className="min-w-0">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {input}
        {suffix && <span className="w-20 shrink-0 text-[11px] leading-tight text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  )
}

export function TextField({ label, value, onChange, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

/** Seção padrão da área de gamificação: cabeçalho com ícone + título/descrição + conteúdo, em card. */
export function SectionCard({ titulo, descricao, icon: Icon, children, className }: { titulo: string; descricao?: string; icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border bg-card p-5 shadow-sm ${className ?? ''}`}>
      <div className="mb-4 flex items-start gap-3">
        {Icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>}
        <div>
          <h3 className="text-sm font-semibold leading-tight">{titulo}</h3>
          {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

export function SaveButton({ salvando, disabled }: { salvando: boolean; disabled?: boolean }) {
  return (
    <Button type="submit" disabled={salvando || disabled}>
      {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
    </Button>
  )
}

/** Barra de ações fixa no topo da aba: some com a rolagem mas volta a "grudar" no topo ao subir. */
export function SaveBar({ salvando, hint, children, dirty }: { salvando: boolean; hint?: string; children?: React.ReactNode; dirty?: boolean }) {
  return (
    <div className={`sticky -top-6 z-20 -mx-1 flex flex-wrap items-center gap-2 border-b px-1 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/70 ${dirty ? 'bg-amber-500/[0.06]' : 'bg-background/85'}`}>
      <div className="mr-auto flex items-center gap-2 text-xs">
        {dirty
          ? <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Alterações não salvas</span>
          : hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
      {children}
      <SaveButton salvando={salvando} />
    </div>
  )
}
