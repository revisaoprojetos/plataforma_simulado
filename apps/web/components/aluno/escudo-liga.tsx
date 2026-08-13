import { cn } from '@/lib/utils'

// Contorno de escudo (mesmo desenho do ícone shield do lucide), preenchível com gradiente.
const SHIELD = 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'

/**
 * Escudo de liga: a PARTE INTERNA (o escudo) tem a cor metálica da liga (gradiente claro→escuro
 * + verniz diagonal, no mesmo acabamento do ícone 100% da trilha); o entorno é neutro.
 * - `ativo`: liga do aluno (cor cheia + glow); inativo fica mais acinzentado.
 * - `fundo`: mostra o tile neutro atrás do escudo. Na coluna lateral, as ligas não-atuais vêm sem fundo.
 */
export function EscudoLiga({ cor, ativo = false, fundo = true, className }: { cor: string; ativo?: boolean; fundo?: boolean; className?: string }) {
  // Inativo → puxa a cor para o cinza do tema (dessaturado).
  const c = ativo ? cor : `color-mix(in oklab, ${cor} 52%, var(--muted-foreground))`
  const claro = `color-mix(in oklab, ${c} 58%, #fff)`
  const escuro = `color-mix(in oklab, ${c} 62%, #000)`
  const borda = `color-mix(in oklab, ${c} 45%, #000)`
  const key = `${cor}-${ativo ? 1 : 0}`.replace(/[^a-z0-9]/gi, '')
  const gFill = `lgf-${key}`
  const gShine = `lgs-${key}`
  return (
    <span
      className={cn('relative inline-flex items-center justify-center rounded-full', className, fundo && 'border')}
      style={fundo ? { background: 'var(--muted)', borderColor: 'var(--border)', ...(ativo ? { boxShadow: `0 0 10px color-mix(in oklab, ${cor} 45%, transparent)` } : {}) } : undefined}
    >
      <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" aria-hidden style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.25))' }}>
        <defs>
          <linearGradient id={gFill} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={claro} />
            <stop offset="48%" stopColor={c} />
            <stop offset="100%" stopColor={escuro} />
          </linearGradient>
          <linearGradient id={gShine} x1="0" y1="0" x2="1" y2="1">
            <stop offset="22%" stopColor="rgba(255,255,255,0)" />
            <stop offset="46%" stopColor="rgba(255,255,255,.6)" />
            <stop offset="60%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <path d={SHIELD} fill={`url(#${gFill})`} stroke={borda} strokeWidth="1" strokeLinejoin="round" />
        <path d={SHIELD} fill={`url(#${gShine})`} />
      </svg>
    </span>
  )
}
