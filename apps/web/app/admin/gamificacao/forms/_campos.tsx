'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Save, type LucideIcon } from 'lucide-react'

/** Linha de configuração compacta: rótulo/ajuda à esquerda, input estreito + sufixo à direita. */
export function NumberField({ label, value, onChange, min = 0, step = 1, suffix, hint, disabled }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; step?: number; suffix?: string; hint?: string; disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 px-3 py-2.5">
      <div className="min-w-0">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Input type="number" inputMode="numeric" min={min} step={step} value={Number.isFinite(value) ? value : 0}
          disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} className="w-24 text-right tabular-nums" />
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
export function SaveBar({ salvando, hint, children }: { salvando: boolean; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="sticky -top-6 z-20 -mx-1 mb-1 flex flex-wrap items-center gap-2 border-b bg-background/85 px-1 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      {hint && <span className="mr-auto text-xs text-muted-foreground">{hint}</span>}
      {!hint && <span className="mr-auto" />}
      {children}
      <SaveButton salvando={salvando} />
    </div>
  )
}
