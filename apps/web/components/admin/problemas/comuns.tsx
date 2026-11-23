import { cn } from '@/lib/utils'
import {
  COR_STATUS, COR_PRIORIDADE, ROTULO_STATUS, ROTULO_PRIORIDADE,
  type StatusProblema, type Prioridade,
} from '@/lib/auditoria-problemas/tipos'

export const CHIP = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap'

export function StatusChip({ status, className }: { status: StatusProblema; className?: string }) {
  return <span className={cn(CHIP, COR_STATUS[status], className)}>{ROTULO_STATUS[status]}</span>
}

export function PrioridadeChip({ prioridade, className }: { prioridade: Prioridade; className?: string }) {
  return <span className={cn(CHIP, COR_PRIORIDADE[prioridade], className)}>{ROTULO_PRIORIDADE[prioridade]}</span>
}

/** "2026-11-19" -> "19/11/2026" (só formatação de exibição). */
export const dataBr = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '—')

export const CAMPO = 'h-10 w-full rounded-lg border bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring'
