'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Save } from 'lucide-react'

/** Campo numérico rotulado, com sufixo/ajuda opcionais. */
export function NumberField({ label, value, onChange, min = 0, step = 1, suffix, hint, disabled }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; step?: number; suffix?: string; hint?: string; disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input type="number" inputMode="numeric" min={min} step={step} value={Number.isFinite(value) ? value : 0}
          disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} className="w-full" />
        {suffix && <span className="shrink-0 text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>}
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

/** Seção padrão da área de gamificação: título + descrição + conteúdo, em card. */
export function SectionCard({ titulo, descricao, children, className }: { titulo: string; descricao?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border bg-card p-5 shadow-sm ${className ?? ''}`}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
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
