'use client'

// Compartilhado do fluxo do simulado — marca REVISÃO (spec 06, coluna Revisão).
// Fundo animado (bgfx), paleta fixa de acentos da marca, ícones e util de modal.
// As cores de tema vêm dos tokens `var(--*)` (sim-tokens.ts); só os acentos fixos
// citados pela spec (amarelo Rev, gradiente roxo, arco-íris) e os SEMÂNTICOS
// (emerald/amber/rose) são hardcode — regra do handoff.

import type { ReactNode } from 'react'

/** Acento amarelo fixo da marca Revisão (spec §0). */
export const REV_GOLD = '#F1C232'
/** Gradiente do botão primário Revisão (spec §0). */
export const REV_GRAD = 'linear-gradient(180deg,#6449E0,#4B30BE)'
export const REV_GRAD_SHADOW = '0 12px 24px -14px rgba(75,48,190,.9)'
/** Faixa arco-íris do topo dos cartões (spec §1.2). */
export const RAINBOW = 'linear-gradient(90deg,#3E5BD8 0%,#8F75FF 30%,#F1A21B 55%,#E58BB8 80%,#9B6BF0 100%)'
/** Sombra difusa roxa dos cartões Revisão. */
export const CARD_SHADOW = '0 24px 50px -36px rgba(40,20,110,.45)'
/** Cores semânticas (exceção à regra de tokens). */
export const OK = '#1FA868'
export const ERR = '#E5484D'
export const WARN = '#F2A93B'

/** Quadradinhos piscantes do bgfx — posições DETERMINÍSTICAS (seed simples). */
function squares(count: number, w: number) {
  const out: { left: number; top: number; gold: boolean; delay: number }[] = []
  let seed = 7
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let i = 0; i < count; i++) {
    out.push({
      left: Math.round(rnd() * (w - 32)),
      top: Math.round(rnd() * 1300),
      gold: rnd() > 0.5,
      delay: +(rnd() * 8).toFixed(2),
    })
  }
  return out
}

/**
 * Fundo animado da marca Revisão: 3 orbs desfocados + quadrados piscando +
 * grade 32px com máscara radial. Decorativo, não interativo. Renderizar UMA vez
 * por tela; conteúdo deve ficar em z-index:1. (spec §0)
 */
export function Bgfx({ prefix }: { prefix: string }) {
  const px = squares(70, 1440)
  return (
    <div aria-hidden className={`${prefix}-bgfx`} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <span className={`${prefix}-orb`} style={{ position: 'absolute', left: -120, top: -80, width: 420, height: 420, borderRadius: '50%', background: 'rgba(100,73,224,.28)', filter: 'blur(140px)', animationDelay: '0s' }} />
      <span className={`${prefix}-orb`} style={{ position: 'absolute', left: '70%', top: '30%', width: 380, height: 380, borderRadius: '50%', background: 'rgba(241,194,50,.18)', filter: 'blur(126px)', animationDelay: '3s' }} />
      <span className={`${prefix}-orb`} style={{ position: 'absolute', left: '20%', top: '75%', width: 320, height: 320, borderRadius: '50%', background: 'rgba(143,117,255,.2)', filter: 'blur(106px)', animationDelay: '6s' }} />
      <div style={{ position: 'absolute', inset: 0 }}>
        {px.map((p, i) => (
          <span
            key={i}
            className={`${prefix}-px`}
            style={{ left: p.left, top: p.top, width: 31, height: 31, background: p.gold ? 'rgba(241,194,50,.2)' : 'rgba(185,168,255,.22)', animationDelay: `${p.delay}s` }}
          />
        ))}
      </div>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px)',
          backgroundSize: '32px 32px',
          opacity: 0.55,
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%,#000,transparent 75%)',
          maskImage: 'radial-gradient(ellipse at 50% 30%,#000,transparent 75%)',
        }}
      />
    </div>
  )
}

/** Logo "R" da Revisão (mesmo path dos mocks/loading). */
export function MarcaR({ size = 52 }: { size?: number }) {
  return (
    <svg viewBox="0 0 68 66" aria-hidden style={{ width: size, height: size }}>
      <path fillRule="evenodd" fill="currentColor" d="M6 5.5H32C43.5 5.5 49 13 49 23C49 31 45 37 39.5 40.5L62 61H6Z M9.2 9.2H19.2V57.6H9.2Z" />
    </svg>
  )
}

/** Ícone lucide-like stroke (compat com o estilo dos mocks). */
export function Ic({ d, size = 16, strokeWidth = 1.8, children, style }: { d?: string; size?: number; strokeWidth?: number; children?: ReactNode; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      style={{ width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', flexShrink: 0, ...style }}
    >
      {d ? <path d={d} /> : children}
    </svg>
  )
}

/** Paths lucide reutilizados. */
export const P = {
  back: 'm15 18-6-6 6-6',
  fwd: 'm9 18 6-6-6-6',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  play: 'M7 4v16l13-8z',
  book: 'M2 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v14a2 2 0 0 1 2-2h8z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  mail: 'm22 6-10 7L2 6',
  chart: 'm7 15 4-4 3 3 5-6',
  check: 'M20 6 9 17l-5-5',
  close: 'M18 6 6 18M6 6l12 12',
  clock: 'M12 7v5l3 2',
  flag: 'M4 22V4M4 4h12l-2 4 2 4H4',
  lock: 'M8 11V7a4 4 0 0 1 8 0v4',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4L21 8',
  home: 'M3 3v18h18',
  info: 'M12 11v5M12 8h.01',
  user: 'M4 21a8 8 0 0 1 16 0',
  bulb: 'M9 18h6M10 22h4',
  chevDown: 'm6 9 6 6 6-6',
  grid: 'M3 3v18h18',
  calendar: 'M16 2v4M8 2v4M3 10h18',
}

/** Classe base dos cartões Revisão. */
export function cardStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 20,
    boxShadow: CARD_SHADOW,
    ...extra,
  }
}

/** Botão primário (gradiente roxo). */
export function primaryBtnStyle(height = 52): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height,
    padding: '0 20px',
    border: 0,
    borderRadius: 14,
    background: REV_GRAD,
    color: '#fff',
    boxShadow: REV_GRAD_SHADOW,
    font: 'inherit',
    fontSize: 14.5,
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

export function ghostBtnStyle(height = 48): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height,
    padding: '0 20px',
    borderRadius: 14,
    background: 'var(--surface)',
    color: 'var(--ink)',
    border: '1.5px solid var(--line2)',
    font: 'inherit',
    fontSize: 14.5,
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

/** CSS transversal das animações (prefixado por tela). */
export function baseKeyframes(p: string) {
  return `
.${p}-root{position:relative;min-height:100vh;width:100%}
.${p}-root *{box-sizing:border-box}
.${p}-sbtn{transition:filter .15s,transform .15s}
.${p}-sbtn:hover{filter:brightness(1.06);transform:translateY(-1px)}
.${p}-sbtn:active{transform:translateY(1px)}
.${p}-alt:hover{border-color:var(--selLine)!important}
.${p}-cut:hover{color:var(--flag)!important;border-color:var(--flag)!important}
.${p}-doc{transition:border-color .2s,transform .2s}
.${p}-doc:hover{border-color:var(--selLine);transform:translateY(-2px)}
.${p}-rowh{transition:background .2s}.${p}-rowh:hover{background:var(--surface2)}
.${p}-nscroll{scrollbar-width:thin}
.${p}-mbg{animation:${p}fadein .25s ease both}
.${p}-mpop{animation:${p}mpop .35s cubic-bezier(.22,1,.36,1) both}
.${p}-msh{animation:${p}msh .35s cubic-bezier(.22,1,.36,1) both}
.${p}-qin{animation:${p}qin .3s cubic-bezier(.22,1,.36,1) both}
.${p}-okpop{animation:${p}okpop .6s cubic-bezier(.34,1.56,.64,1) both}
.${p}-grow{transform-origin:50% 100%;animation:${p}growY 1s cubic-bezier(.22,1,.36,1) both}
.${p}-bar{animation:${p}barw 1s cubic-bezier(.22,1,.36,1) both}
.${p}-orb{animation:${p}orb 14s ease-in-out infinite alternate}
.${p}-px{position:absolute;opacity:0;animation:${p}px 7s ease-in-out infinite}
@keyframes ${p}fadein{from{opacity:0}}
@keyframes ${p}mpop{from{opacity:0;transform:translate(-50%,-46%) scale(.96)}}
@keyframes ${p}msh{from{transform:translateY(40px);opacity:0}}
@keyframes ${p}qin{from{opacity:0;transform:translateX(10px)}}
@keyframes ${p}okpop{from{transform:scale(.4);opacity:0}}
@keyframes ${p}growY{from{transform:scaleY(0)}}
@keyframes ${p}barw{from{width:0}}
@keyframes ${p}orb{to{transform:translate(40px,-30px) scale(1.12)}}
@keyframes ${p}px{0%,100%{opacity:0}12%,30%{opacity:1}44%{opacity:0}}
@media (prefers-reduced-motion:reduce){
  .${p}-root *{animation:none!important;transition:none!important}
  .${p}-grow{transform:none!important}
  .${p}-bar{width:revert!important}
  .${p}-px{opacity:0!important}
}
`
}
