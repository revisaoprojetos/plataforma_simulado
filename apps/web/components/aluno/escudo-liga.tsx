import { Book, GraduationCap, Landmark, Gavel, Scale, Shield, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Tema jurídico por liga (ids-semente). Fallback = escudo.
const ICONE_LIGA: Record<string, LucideIcon> = {
  bronze: Book,          // caderno → estudante
  prata: GraduationCap,  // capelo de colação
  ouro: Landmark,        // tribunal (prédio de colunas)
  diamante: Gavel,       // martelo da justiça
  ametista: Scale,       // balança da justiça
}

/**
 * Emblema de liga: ícone TEMÁTICO (jurídico) por liga, pintado com a cor METÁLICA da liga
 * (gradiente claro→cor→escuro), sobre entorno neutro opcional.
 * - `ativo`: liga do aluno (cor cheia + glow); inativo fica mais acinzentado.
 * - `fundo`: mostra o tile neutro atrás. Na coluna lateral, as ligas não-atuais vêm sem fundo.
 */
export function EscudoLiga({ cor, ligaId, ativo = false, fundo = true, className }: { cor: string; ligaId?: string; ativo?: boolean; fundo?: boolean; className?: string }) {
  const Icon = (ligaId && ICONE_LIGA[ligaId.toLowerCase()]) || Shield
  // Inativo → puxa a cor para o cinza do tema (dessaturado).
  const c = ativo ? cor : `color-mix(in oklab, ${cor} 52%, var(--muted-foreground))`
  const claro = `color-mix(in oklab, ${c} 62%, #fff)`
  const escuro = `color-mix(in oklab, ${c} 55%, #000)`
  const key = `${cor}-${ligaId ?? ''}-${ativo ? 1 : 0}`.replace(/[^a-z0-9]/gi, '')
  const gid = `lig-${key}`
  return (
    <span
      className={cn('relative inline-flex items-center justify-center rounded-full', className, fundo && 'border')}
      style={fundo ? { background: 'var(--muted)', borderColor: 'var(--border)', ...(ativo ? { boxShadow: `0 0 10px color-mix(in oklab, ${cor} 45%, transparent)` } : {}) } : undefined}
    >
      {/* Gradiente metálico da liga (referenciado pelo stroke do ícone). */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={claro} />
            <stop offset="50%" stopColor={c} />
            <stop offset="100%" stopColor={escuro} />
          </linearGradient>
        </defs>
      </svg>
      <Icon className="relative h-[58%] w-[58%]" stroke={`url(#${gid})`} strokeWidth={2.1} style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.22))' }} />
    </span>
  )
}
