import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Info, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variante = 'aviso' | 'info' | 'sucesso' | 'perigo'

const CFG: Record<Variante, { cls: string; icon: LucideIcon }> = {
  aviso: { cls: 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200', icon: AlertTriangle },
  info: { cls: 'border-sky-300/60 bg-sky-50 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/25 dark:text-sky-200', icon: Info },
  sucesso: { cls: 'border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200', icon: CheckCircle2 },
  perigo: { cls: 'border-red-300/60 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/25 dark:text-red-200', icon: XCircle },
}

/**
 * Caixa de aviso padronizada (substitui os blocos amber duplicados pelo admin).
 * Uma fonte única de estilo — muda aqui, muda em todo lugar.
 */
export function AlertBox({ variante = 'aviso', titulo, children, icon, className }: {
  variante?: Variante
  titulo?: string
  children?: React.ReactNode
  icon?: LucideIcon
  className?: string
}) {
  const cfg = CFG[variante]
  const Icon = icon ?? cfg.icon
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm', cfg.cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {titulo && <p className="font-semibold leading-snug">{titulo}</p>}
        {children != null && <div className={cn(titulo && 'mt-0.5 opacity-90')}>{children}</div>}
      </div>
    </div>
  )
}

/** Atalho para o aviso de acesso negado, padronizado em todo o admin. */
export function SemPermissao({ children = 'Você não tem permissão para acessar esta área.' }: { children?: React.ReactNode }) {
  return <AlertBox variante="aviso" icon={ShieldAlert}>{children}</AlertBox>
}
