import { cn } from '@/lib/utils'
import { Lock, FolderTree, ArrowDownToLine, SlidersHorizontal, Clock, EyeOff } from 'lucide-react'

// Pílulas do ecossistema de acesso/visibilidade (spec 01 §3). Modos de acesso de pasta/conteúdo + estados.
// Cores via TOKEN (white-label) exceto semânticas fixas (bloquear=destructive, agendado=âmbar, oculto=cinza).

export type ModoAcesso = 'principal' | 'herdar' | 'propria' | 'bloquear'
export type EstadoExtra = 'agendado' | 'oculto'

const MODO_INFO: Record<ModoAcesso, { rotulo: string; Icone: typeof Lock; cls: string }> = {
  principal: { rotulo: 'Pasta principal · define o padrão', Icone: FolderTree, cls: 'bg-primary/10 text-primary border-primary/20' },
  herdar: { rotulo: 'Herdado · segue a pasta acima', Icone: ArrowDownToLine, cls: 'bg-muted text-muted-foreground border-border' },
  propria: { rotulo: 'Regra própria · sobrescreve', Icone: SlidersHorizontal, cls: 'bg-primary/10 text-primary border-primary/25' },
  bloquear: { rotulo: 'Bloqueado · só equipe', Icone: Lock, cls: 'bg-destructive/10 text-destructive border-destructive/25' },
}

const EXTRA_INFO: Record<EstadoExtra, { rotulo: string; Icone: typeof Lock; cls: string }> = {
  agendado: { rotulo: 'Agendado', Icone: Clock, cls: 'bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/25' },
  oculto: { rotulo: 'Oculto', Icone: EyeOff, cls: 'bg-muted text-muted-foreground border-border' },
}

function PilulaBase({ Icone, texto, cls, className }: { Icone: typeof Lock; texto: string; cls: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', cls, className)}>
      <Icone className="h-3 w-3 shrink-0" aria-hidden />
      {texto}
    </span>
  )
}

/** Pílula do modo de acesso (principal/herdar/propria/bloquear). `curto`=só o rótulo antes do "·". */
export function PilulaModo({ modo, curto, className }: { modo: ModoAcesso; curto?: boolean; className?: string }) {
  const i = MODO_INFO[modo]
  const texto = curto ? i.rotulo.split(' · ')[0] : i.rotulo
  return <PilulaBase Icone={i.Icone} texto={texto} cls={i.cls} className={className} />
}

/** Pílula de estado extra (agendado/oculto). */
export function PilulaEstado({ estado, className }: { estado: EstadoExtra; className?: string }) {
  const i = EXTRA_INFO[estado]
  return <PilulaBase Icone={i.Icone} texto={i.rotulo} cls={i.cls} className={className} />
}

/** Chip genérico (rounded-full). `ativo` pinta na marca; `onClick` o torna clicável (filtros). */
export function Chip({
  children,
  ativo,
  onClick,
  className,
}: {
  children: React.ReactNode
  ativo?: boolean
  onClick?: () => void
  className?: string
}) {
  const Comp = onClick ? 'button' : 'span'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        ativo ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground',
        onClick && 'cursor-pointer hover:border-primary/30 hover:text-foreground',
        className,
      )}
    >
      {children}
    </Comp>
  )
}
