import { cn } from '@/lib/utils'

// Emblemas jurídicos por liga (viewBox 0 0 24 24). `fill` = corpo metálico; `det` = gravação (tom
// mais escuro) p/ os detalhes. Autorados com detalhe e escalados (vetor) p/ caber no círculo.
function Emblema({ tipo, fill, det }: { tipo: string; fill: string; det: string }) {
  switch (tipo) {
    case 'livro': // livro de Direito em pé (capa + páginas) + lombada e louro gravados
      return (
        <>
          <path d="M6.2 18.6 H18 L17 20.9 H7.2 Z" fill={fill} />
          <path d="M6.6 2.9 H17.6 A0.8 0.8 0 0 1 18.4 3.7 V19 H7 A2.6 2.6 0 0 1 4.4 16.4 V5.5 A2.6 2.6 0 0 1 7 2.9 Z" fill={fill} />
          <g fill="none" stroke={det} strokeWidth="0.75" strokeLinecap="round">
            <path d="M7.9 3.5 V18.4" strokeWidth="1" />
            <path d="M11.7 15 Q9.3 14.4 8.7 12" />
            <path d="M11.7 15 Q14.1 14.4 14.7 12" />
          </g>
          <g fill={det} stroke="none">
            <ellipse cx="9.2" cy="13.8" rx="0.95" ry="0.46" transform="rotate(42 9.2 13.8)" />
            <ellipse cx="8.7" cy="12.3" rx="0.9" ry="0.44" transform="rotate(58 8.7 12.3)" />
            <ellipse cx="14.2" cy="13.8" rx="0.95" ry="0.46" transform="rotate(-42 14.2 13.8)" />
            <ellipse cx="14.7" cy="12.3" rx="0.9" ry="0.44" transform="rotate(-58 14.7 12.3)" />
          </g>
        </>
      )
    case 'capelo': // mortarboard + botão, fio e franjas da borla (gravados)
      return (
        <>
          <path d="M12 3 22.5 8 12 13 1.5 8Z" fill={fill} />
          <path d="M5.5 10.1 12 13.1 18.5 10.1V15C18.5 15 16.4 17.8 12 17.8 7.6 17.8 5.5 15 5.5 15Z" fill={fill} />
          <rect x="21.35" y="8.3" width="1.1" height="4.6" fill={fill} />
          <circle cx="21.9" cy="13.6" r="1.35" fill={fill} />
          <circle cx="12" cy="8" r="0.85" fill={det} />
          <path d="M12 8 Q21.9 8.7 21.9 12.8" fill="none" stroke={det} strokeWidth="0.7" strokeLinecap="round" />
          <g stroke={det} strokeWidth="0.5" strokeLinecap="round">
            <path d="M21.2 14.6 V16" /><path d="M21.9 14.8 V16.3" /><path d="M22.6 14.6 V16" />
          </g>
        </>
      )
    case 'tribunal': // Capitólio (cúpula + frontão + colunas + base) c/ nervuras e frisos gravados
      return (
        <>
          <circle cx="12" cy="1.9" r="0.75" fill={fill} />
          <rect x="11.6" y="2.4" width="0.8" height="1.7" fill={fill} />
          <path d="M8.6 8.1 A3.4 3.4 0 0 1 15.4 8.1 Z" fill={fill} />
          <rect x="9.1" y="8.1" width="5.8" height="0.95" fill={fill} />
          <path d="M3.6 12 12 8.2 20.4 12Z" fill={fill} />
          <rect x="3" y="12.3" width="18" height="1.7" rx="0.4" fill={fill} />
          <rect x="4.6" y="14.4" width="1.7" height="5" fill={fill} />
          <rect x="8" y="14.4" width="1.7" height="5" fill={fill} />
          <rect x="11.15" y="14.4" width="1.7" height="5" fill={fill} />
          <rect x="14.3" y="14.4" width="1.7" height="5" fill={fill} />
          <rect x="17.7" y="14.4" width="1.7" height="5" fill={fill} />
          <rect x="2.4" y="19.6" width="19.2" height="2.4" rx="0.6" fill={fill} />
          <g stroke={det} strokeWidth="0.5" strokeLinecap="round" fill="none">
            <path d="M12 5.1 V8" /><path d="M9.9 5.6 Q9.8 7 9.6 8" /><path d="M14.1 5.6 Q14.2 7 14.4 8" />
            <path d="M5.45 14.8 V19" /><path d="M8.85 14.8 V19" /><path d="M12 14.8 V19" /><path d="M15.15 14.8 V19" /><path d="M18.55 14.8 V19" />
          </g>
        </>
      )
    case 'martelo': // martelo diagonal (cabeça c/ bandas gravadas + cabo + punho) + bloco de som
      return (
        <>
          <rect x="11.7" y="19.5" width="10.1" height="2.7" rx="1.35" fill={fill} />
          <g transform="rotate(-42 12 12)">
            <rect x="5.5" y="3.6" width="13" height="4.4" rx="2.2" fill={fill} />
            <rect x="10.6" y="8" width="2.8" height="10.4" rx="1.4" fill={fill} />
            <circle cx="12" cy="19" r="1.9" fill={fill} />
            <g stroke={det} strokeWidth="0.6" strokeLinecap="round">
              <path d="M8.5 3.9 V7.7" /><path d="M15.5 3.9 V7.7" />
            </g>
          </g>
        </>
      )
    case 'balanca': // balança — finial, trave em arco, cordas em V, conchas e base curvas + aros gravados
      return (
        <>
          <path d="M12 1.2 13.1 3 12 4.6 10.9 3Z" fill={fill} />
          <path d="M3.2 5.6Q12 3.8 20.8 5.6L20.5 7.1Q12 5.4 3.5 7.1Z" fill={fill} />
          <rect x="11.25" y="4.4" width="1.5" height="13.6" rx="0.5" fill={fill} />
          <path d="M9.3 17.6 14.7 17.6 15.7 19.4 8.3 19.4Z" fill={fill} />
          <path d="M6.6 19.4Q6 19.4 6 20.2V21.6H18V20.2Q18 19.4 17.4 19.4Z" fill={fill} />
          <g stroke={fill} strokeWidth="0.95" strokeLinecap="round" fill="none">
            <path d="M4 6.6Q2.7 8.9 2.4 10.6" /><path d="M4 6.6Q5.3 8.9 5.6 10.6" />
            <path d="M20 6.6Q18.7 8.9 18.4 10.6" /><path d="M20 6.6Q21.3 8.9 21.6 10.6" />
          </g>
          <path d="M1.5 10.5Q4 16.2 6.5 10.5Q4 12 1.5 10.5Z" fill={fill} />
          <path d="M17.5 10.5Q20 16.2 22.5 10.5Q20 12 17.5 10.5Z" fill={fill} />
          <g stroke={det} strokeWidth="0.5" fill="none" strokeLinecap="round">
            <path d="M1.8 10.8 Q4 11.9 6.2 10.8" /><path d="M17.8 10.8 Q20 11.9 22.2 10.8" />
            <path d="M12 8 V16.4" />
          </g>
        </>
      )
    default:
      return <path d="M12 2.5 4.5 5.2V11.5C4.5 16.3 8 19.8 12 21.4 16 19.8 19.5 16.3 19.5 11.5V5.2Z" fill={fill} />
  }
}

// Mapeia pela liga (por NOME — o tenant pode renomear mantendo o id-semente).
const POR_NOME: Record<string, string> = {
  bronze: 'livro', prata: 'capelo', ouro: 'martelo', diamante: 'balanca', ametista: 'tribunal',
}
const norm = (s?: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Emblema de liga: silhueta jurídica detalhada, preenchida com a cor METÁLICA da liga
 * (gradiente claro→cor→escuro + brilho diagonal + gravações em tom escuro), com contorno e
 * entorno neutro. `ativo` = liga do aluno (cor cheia + glow); `fundo` = tile neutro atrás.
 */
export function EscudoLiga({ cor, nome, ativo = false, fundo = true, className }: { cor: string; nome?: string; ativo?: boolean; fundo?: boolean; className?: string }) {
  const tipo = POR_NOME[norm(nome)] ?? 'escudo'
  const c = ativo ? cor : `color-mix(in oklab, ${cor} 52%, var(--muted-foreground))`
  const claro = `color-mix(in oklab, ${c} 40%, #fff)`
  const escuro = `color-mix(in oklab, ${c} 50%, #000)`
  const borda = `color-mix(in oklab, ${c} 42%, #000)`
  const det = `color-mix(in oklab, ${c} 60%, #000)`
  const key = `${cor}-${tipo}-${ativo ? 1 : 0}`.replace(/[^a-z0-9]/gi, '')
  const gMetal = `ligm-${key}`
  const gShine = `ligs-${key}`
  return (
    <span
      className={cn('relative inline-flex items-center justify-center rounded-full', className, fundo && 'border')}
      style={fundo ? { background: 'var(--muted)', borderColor: 'var(--border)', ...(ativo ? { boxShadow: `0 0 10px color-mix(in oklab, ${cor} 45%, transparent)` } : {}) } : undefined}
    >
      <svg viewBox="0 0 24 24" className="h-[66%] w-[66%]" aria-hidden style={{ filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,.3))' }}>
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
        {/* corpo metálico com contorno + gravações + brilho diagonal por cima */}
        <g stroke={borda} strokeWidth="0.7" strokeLinejoin="round" strokeLinecap="round">
          <Emblema tipo={tipo} fill={`url(#${gMetal})`} det={det} />
        </g>
        <Emblema tipo={tipo} fill={`url(#${gShine})`} det="transparent" />
      </svg>
    </span>
  )
}
