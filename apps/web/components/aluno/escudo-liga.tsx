import { cn } from '@/lib/utils'

// Emblemas jurídicos SÓLIDOS por liga (viewBox 0 0 24 24), preenchidos com o `fill` recebido.
function Emblema({ tipo, fill }: { tipo: string; fill: string }) {
  switch (tipo) {
    case 'livro': // livro ABERTO (caderno) → estudante
      return (
        <>
          <path d="M12 6.2C9.5 4.4 6 4.2 3 5.2V18.8C6 17.8 9.5 18 12 19.8Z" fill={fill} />
          <path d="M12 6.2C14.5 4.4 18 4.2 21 5.2V18.8C18 17.8 14.5 18 12 19.8Z" fill={fill} />
        </>
      )
    case 'capelo': // capelo de colação (mortarboard + borla)
      return (
        <>
          <path d="M12 3 22.5 8 12 13 1.5 8Z" fill={fill} />
          <path d="M5.5 10.1 12 13.1 18.5 10.1V15C18.5 15 16.4 17.8 12 17.8 7.6 17.8 5.5 15 5.5 15Z" fill={fill} />
          <rect x="21.35" y="8.3" width="1.1" height="4.6" fill={fill} />
          <circle cx="21.9" cy="13.4" r="1.25" fill={fill} />
        </>
      )
    case 'tribunal': // tribunal (frontão + colunas + base)
      return (
        <>
          <path d="M12 2 22 7.5 2 7.5Z" fill={fill} />
          <rect x="3" y="8.4" width="18" height="1.9" rx="0.4" fill={fill} />
          <rect x="4.6" y="10.9" width="1.7" height="7.9" fill={fill} />
          <rect x="9" y="10.9" width="1.7" height="7.9" fill={fill} />
          <rect x="13.3" y="10.9" width="1.7" height="7.9" fill={fill} />
          <rect x="17.7" y="10.9" width="1.7" height="7.9" fill={fill} />
          <rect x="2.5" y="19.4" width="19" height="2.6" rx="0.6" fill={fill} />
        </>
      )
    case 'martelo': // martelo da justiça na DIAGONAL (cabeça grande + cabo longo) quase batendo no bloco
      return (
        <>
          <g transform="rotate(30 12 12)">
            <rect x="4.8" y="13.4" width="14.4" height="5.3" rx="2.65" fill={fill} />
            <rect x="10.3" y="2.6" width="3.4" height="11.4" rx="1.7" fill={fill} />
          </g>
          <rect x="4.3" y="20.3" width="15.4" height="2.7" rx="1.35" fill={fill} />
        </>
      )
    case 'balanca': // balança da justiça — trave em arco, cordas em V, conchas e base curvas
      return (
        <>
          <circle cx="12" cy="2.7" r="1.35" fill={fill} />
          <path d="M3.2 5.4Q12 3.6 20.8 5.4L20.5 7Q12 5.3 3.5 7Z" fill={fill} />
          <rect x="11.25" y="4" width="1.5" height="14.6" rx="0.6" fill={fill} />
          <path d="M7 18.6Q12 17 17 18.6L18.3 21.9Q12 20.4 5.7 21.9Z" fill={fill} />
          <path d="M4 6.5Q2.6 8.9 2.3 10.6" fill="none" stroke={fill} strokeWidth="0.95" strokeLinecap="round" />
          <path d="M4 6.5Q5.4 8.9 5.7 10.6" fill="none" stroke={fill} strokeWidth="0.95" strokeLinecap="round" />
          <path d="M20 6.5Q18.6 8.9 18.3 10.6" fill="none" stroke={fill} strokeWidth="0.95" strokeLinecap="round" />
          <path d="M20 6.5Q21.4 8.9 21.7 10.6" fill="none" stroke={fill} strokeWidth="0.95" strokeLinecap="round" />
          <path d="M1.4 10.5Q4 16.3 6.6 10.5Q4 12.1 1.4 10.5Z" fill={fill} />
          <path d="M17.4 10.5Q20 16.3 22.6 10.5Q20 12.1 17.4 10.5Z" fill={fill} />
        </>
      )
    default: // escudo (fallback)
      return <path d="M12 2.5 4.5 5.2V11.5C4.5 16.3 8 19.8 12 21.4 16 19.8 19.5 16.3 19.5 11.5V5.2Z" fill={fill} />
  }
}

// Mapeia pela liga (por NOME — o tenant pode renomear mantendo o id-semente).
const POR_NOME: Record<string, string> = {
  bronze: 'livro', prata: 'capelo', ouro: 'tribunal', diamante: 'martelo', ametista: 'balanca',
}
const norm = (s?: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Emblema de liga: silhueta jurídica SÓLIDA, preenchida com a cor METÁLICA da liga
 * (gradiente claro→cor→escuro + brilho diagonal), sobre entorno neutro opcional.
 * - `ativo`: liga do aluno (cor cheia + glow); inativo fica mais acinzentado.
 * - `fundo`: mostra o tile neutro atrás. Na coluna lateral, as ligas não-atuais vêm sem fundo.
 */
export function EscudoLiga({ cor, nome, ativo = false, fundo = true, className }: { cor: string; nome?: string; ativo?: boolean; fundo?: boolean; className?: string }) {
  const tipo = POR_NOME[norm(nome)] ?? 'escudo'
  // Inativo → puxa a cor para o cinza do tema (dessaturado).
  const c = ativo ? cor : `color-mix(in oklab, ${cor} 52%, var(--muted-foreground))`
  const claro = `color-mix(in oklab, ${c} 40%, #fff)`
  const escuro = `color-mix(in oklab, ${c} 50%, #000)`
  const borda = `color-mix(in oklab, ${c} 42%, #000)`
  const key = `${cor}-${tipo}-${ativo ? 1 : 0}`.replace(/[^a-z0-9]/gi, '')
  const gMetal = `ligm-${key}`
  const gShine = `ligs-${key}`
  return (
    <span
      className={cn('relative inline-flex items-center justify-center rounded-full', className, fundo && 'border')}
      style={fundo ? { background: 'var(--muted)', borderColor: 'var(--border)', ...(ativo ? { boxShadow: `0 0 10px color-mix(in oklab, ${cor} 45%, transparent)` } : {}) } : undefined}
    >
      <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" aria-hidden style={{ filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,.3))' }}>
        <defs>
          <linearGradient id={gMetal} x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0%" stopColor={claro} />
            <stop offset="48%" stopColor={c} />
            <stop offset="100%" stopColor={escuro} />
          </linearGradient>
          <linearGradient id={gShine} x1="0" y1="0" x2="1" y2="1">
            <stop offset="32%" stopColor="rgba(255,255,255,0)" />
            <stop offset="47%" stopColor="rgba(255,255,255,.26)" />
            <stop offset="58%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        {/* base metálica com contorno + brilho diagonal suave por cima (mesma silhueta) */}
        <g stroke={borda} strokeWidth="0.7" strokeLinejoin="round" strokeLinecap="round">
          <Emblema tipo={tipo} fill={`url(#${gMetal})`} />
        </g>
        <Emblema tipo={tipo} fill={`url(#${gShine})`} />
      </svg>
    </span>
  )
}
