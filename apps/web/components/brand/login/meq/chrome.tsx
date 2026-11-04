'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Peças de "chrome" compartilhadas pelas 3 variantes de login MEQ (spec 02 §2.5).
// Porte fiel dos mockups design/LoginMEQ*.dc.html. Puro presentacional.
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { MEQ_MARK_PATH, MEQ_WORDMARK as W, MEQ_CIRC_PATHS } from '../../brand-marks'
import type { LoginTheme } from '../types'

export type MeqTheme = Extract<LoginTheme, 'claro' | 'azul' | 'escuro'>

export function asMeqTheme(t: LoginTheme): MeqTheme {
  return t === 'escuro' ? 'escuro' : t === 'azul' ? 'azul' : 'claro'
}

// Paleta pixel-perfeita por tema (extraída de cada mockup .dc.html).
export type MeqChrome = {
  bg: string
  glowBg: string
  circOl: { stroke: string; opacity: string }
  circPl: string
  /** cor do retângulo atrás da marca MEQ no header */
  markBox: string
  /** cor dos triângulos da marca no header */
  markTri: string
  /** cor das letras "MEQ Concursos" do wordmark no header */
  wordFill: string
  /** segmentos acentuados do "E" do wordmark */
  wordSeg: string
  h1: string
  /** ticker "Tribunais./Polícias./Fiscais." no CIRCUITO — gradiente ou sólido */
  tickerColor: string
  tickerGradient?: string
  /** ticker no DIVIDIDO (sempre sólido no mockup) */
  tickerDividido: string
  /** ticker na TRILHA (.hl) — sólido em claro/azul, gradiente em escuro */
  tickerTrilhaColor: string
  tickerTrilhaGradient?: string
  para: string
  eyebrow: string
  cardTitle: string
  cardBg: string
  cardBorder: string
  cardFg: string
  gaugeBar: string
  chip: string
  chipIcon: string
  foot: string
  /** chips de recurso (trilha usa fundo/borda) */
  chipBg: string
  chipBorder: string
  chipFg: string
  /** passos numerados (dividido) */
  stepBase: string
  stepBorder: string
  stepNumFg: string
  /** cor de fundo/borda do passo quando ACESO (stepOn) */
  stepLitBg: string
  /** cor do número do passo quando ACESO (null = não muda) */
  stepLitFg: string | null
  stepTitle: string
  stepDesc: string
  /** rota (trilha) */
  routeBase: string
  routePulse: string
  routeNode: string
  routeNodeStroke: string
  routeCore: string
  routeNum: string
  routeLabel: string
  /** 4 segmentos da barra do topo do card (dividido/trilha) */
  cardBar: [string, string, string, string]
}

export const CHROME: Record<MeqTheme, MeqChrome> = {
  claro: {
    bg: 'linear-gradient(180deg,var(--pn-f6f9fe,#F6F9FE) 0%,var(--pn-eef3fb,#EEF3FB) 55%,var(--pn-e3ecf8,#E3ECF8) 100%)',
    glowBg: 'radial-gradient(closest-side, color-mix(in srgb,var(--pn-5ecef0,#5ECEF0) 35%,transparent), color-mix(in srgb,var(--pn-5ecef0,#5ECEF0) 0%,transparent))',
    circOl: { stroke: 'var(--pn-306ab5,#306AB5)', opacity: '0.2' },
    circPl: 'var(--pn-3e7fe0,#3E7FE0)',
    markBox: 'var(--pn-306ab5,#306AB5)',
    markTri: '#FFFFFF',
    wordFill: 'var(--pn-171e3b,#171E3B)',
    wordSeg: 'var(--pn-3e7fe0,#3E7FE0)',
    h1: 'var(--pn-171e3b,#171E3B)',
    tickerColor: 'var(--pn-2f64c8,#2F64C8)',
    tickerGradient: 'linear-gradient(90deg,var(--pn-2f64c8,#2F64C8),var(--pn-3e9fdb,#3E9FDB) 50%,var(--pn-306ab5,#306AB5))',
    tickerDividido: 'var(--pn-2f64c8,#2F64C8)',
    tickerTrilhaColor: 'var(--pn-2f64c8,#2F64C8)',
    para: 'var(--pn-56628a,#56628A)',
    eyebrow: 'var(--pn-306ab5,#306AB5)',
    cardTitle: 'var(--pn-171e3b,#171E3B)',
    cardBg: '#FFFFFF',
    cardBorder: 'var(--pn-dce3f2,#DCE3F2)',
    cardFg: 'var(--pn-171e3b,#171E3B)',
    gaugeBar: 'var(--pn-3e7fe0,#3E7FE0)',
    chip: 'var(--pn-3b4670,#3B4670)',
    chipIcon: 'var(--pn-306ab5,#306AB5)',
    foot: 'var(--pn-7d89ae,#7D89AE)',
    chipBg: 'color-mix(in srgb,var(--pn-306ab5,#306AB5) 7%,transparent)',
    chipBorder: 'color-mix(in srgb,var(--pn-306ab5,#306AB5) 18%,transparent)',
    chipFg: 'var(--pn-3b4670,#3B4670)',
    stepBase: 'color-mix(in srgb,var(--pn-306ab5,#306AB5) 8%,transparent)',
    stepBorder: 'color-mix(in srgb,var(--pn-306ab5,#306AB5) 25%,transparent)',
    stepNumFg: 'var(--pn-306ab5,#306AB5)',
    stepLitBg: 'var(--pn-306ab5,#306AB5)',
    stepLitFg: '#FFFFFF',
    stepTitle: 'var(--pn-171e3b,#171E3B)',
    stepDesc: 'var(--pn-66729a,#66729A)',
    routeBase: 'color-mix(in srgb,var(--pn-306ab5,#306AB5) 28%,transparent)',
    routePulse: 'var(--pn-3e7fe0,#3E7FE0)',
    routeNode: '#FFFFFF',
    routeNodeStroke: 'color-mix(in srgb,var(--pn-306ab5,#306AB5) 28%,transparent)',
    routeCore: 'var(--pn-3e7fe0,#3E7FE0)',
    routeNum: 'var(--pn-306ab5,#306AB5)',
    routeLabel: 'var(--pn-3b4670,#3B4670)',
    cardBar: ['#2B5FA8', '#3E7FE0', '#4497DB', '#5ECEF0'],
  },
  azul: {
    bg: 'linear-gradient(160deg,var(--pn-2b5fa8,#2B5FA8) 0%,var(--pn-306ab5,#306AB5) 40%,var(--pn-4497db,#4497DB) 100%)',
    glowBg: 'radial-gradient(closest-side, color-mix(in srgb,var(--pn-5ecef0,#5ECEF0) 60%,transparent), color-mix(in srgb,var(--pn-5ecef0,#5ECEF0) 0%,transparent))',
    circOl: { stroke: 'var(--pn-8beaea,#8BEAEA)', opacity: '0.45' },
    circPl: '#FFFFFF',
    markBox: '#FFFFFF',
    markTri: 'var(--pn-171e3b,#171E3B)',
    wordFill: '#FFFFFF',
    wordSeg: 'var(--pn-8beaea,#8BEAEA)',
    h1: '#FFFFFF',
    tickerColor: 'var(--pn-8beaea,#8BEAEA)',
    tickerDividido: 'var(--pn-8beaea,#8BEAEA)',
    tickerTrilhaColor: 'var(--pn-8beaea,#8BEAEA)',
    para: 'var(--pn-e3f4ff,#E3F4FF)',
    eyebrow: 'var(--pn-306ab5,#306AB5)',
    cardTitle: 'var(--pn-171e3b,#171E3B)',
    cardBg: '#FFFFFF',
    cardBorder: 'var(--pn-dce3f2,#DCE3F2)',
    cardFg: 'var(--pn-171e3b,#171E3B)',
    gaugeBar: 'var(--pn-3e7fe0,#3E7FE0)',
    chip: 'var(--pn-e3f4ff,#E3F4FF)',
    chipIcon: '#FFFFFF',
    foot: 'var(--pn-dcebff,#DCEBFF)',
    chipBg: 'rgba(255,255,255,.12)',
    chipBorder: 'rgba(255,255,255,.28)',
    chipFg: 'var(--pn-e3f4ff,#E3F4FF)',
    stepBase: 'rgba(255,255,255,.14)',
    stepBorder: 'rgba(255,255,255,.28)',
    stepNumFg: '#FFFFFF',
    stepLitBg: 'var(--pn-171e3b,#171E3B)',
    stepLitFg: null,
    stepTitle: '#FFFFFF',
    stepDesc: 'var(--pn-dcebff,#DCEBFF)',
    routeBase: 'rgba(255,255,255,.35)',
    routePulse: 'var(--pn-8beaea,#8BEAEA)',
    routeNode: 'var(--pn-2b5fa8,#2B5FA8)',
    routeNodeStroke: 'rgba(255,255,255,.5)',
    routeCore: 'var(--pn-8beaea,#8BEAEA)',
    routeNum: '#FFFFFF',
    routeLabel: 'var(--pn-e3f4ff,#E3F4FF)',
    cardBar: ['#2B5FA8', '#3E7FE0', '#4497DB', '#5ECEF0'],
  },
  escuro: {
    bg: 'linear-gradient(180deg,var(--pn-121a3a,#121A3A) 0%,var(--pn-141b38,#141B38) 55%,var(--pn-0b1124,#0B1124) 100%)',
    glowBg: 'radial-gradient(closest-side, color-mix(in srgb,var(--pn-3e7fe0,#3E7FE0) 55%,transparent), color-mix(in srgb,var(--pn-3e7fe0,#3E7FE0) 0%,transparent))',
    circOl: { stroke: 'var(--pn-5e8ef0,#5E8EF0)', opacity: '0.4' },
    circPl: 'var(--pn-8beaea,#8BEAEA)',
    markBox: '#FFFFFF',
    markTri: 'var(--pn-306ab5,#306AB5)',
    wordFill: '#FFFFFF',
    wordSeg: 'var(--pn-5ecef0,#5ECEF0)',
    h1: '#FFFFFF',
    tickerColor: 'var(--pn-5ecef0,#5ECEF0)',
    tickerGradient: 'linear-gradient(90deg,var(--pn-5ecef0,#5ECEF0),var(--pn-8beaea,#8BEAEA) 45%,var(--pn-7fa8ff,#7FA8FF))',
    tickerDividido: 'var(--pn-8beaea,#8BEAEA)',
    tickerTrilhaColor: 'transparent',
    tickerTrilhaGradient: 'linear-gradient(90deg,var(--pn-5ecef0,#5ECEF0),var(--pn-8beaea,#8BEAEA) 45%,var(--pn-7fa8ff,#7FA8FF))',
    para: 'var(--pn-a9b6d9,#A9B6D9)',
    eyebrow: 'var(--pn-5ecef0,#5ECEF0)',
    cardTitle: '#FFFFFF',
    cardBg: 'linear-gradient(180deg,color-mix(in srgb,var(--pn-1a244e,#1A244E) 82%,transparent),color-mix(in srgb,var(--pn-0e1531,#0E1531) 88%,transparent))',
    cardBorder: 'color-mix(in srgb,var(--pn-8caaff,#8CAAFF) 20%,transparent)',
    cardFg: '#FFFFFF',
    gaugeBar: 'var(--pn-5ecef0,#5ECEF0)',
    chip: 'var(--pn-c8d3f2,#C8D3F2)',
    chipIcon: 'var(--pn-5ecef0,#5ECEF0)',
    foot: 'var(--pn-7f8bb3,#7F8BB3)',
    chipBg: 'color-mix(in srgb,var(--pn-8caaff,#8CAAFF) 8%,transparent)',
    chipBorder: 'color-mix(in srgb,var(--pn-8caaff,#8CAAFF) 20%,transparent)',
    chipFg: 'var(--pn-c8d3f2,#C8D3F2)',
    stepBase: 'color-mix(in srgb,var(--pn-8caaff,#8CAAFF) 10%,transparent)',
    stepBorder: 'color-mix(in srgb,var(--pn-8caaff,#8CAAFF) 28%,transparent)',
    stepNumFg: '#FFFFFF',
    stepLitBg: 'var(--pn-3e7fe0,#3E7FE0)',
    stepLitFg: null,
    stepTitle: '#FFFFFF',
    stepDesc: 'var(--pn-a9b6d9,#A9B6D9)',
    routeBase: 'color-mix(in srgb,var(--pn-8caaff,#8CAAFF) 32%,transparent)',
    routePulse: 'var(--pn-5ecef0,#5ECEF0)',
    routeNode: 'var(--pn-1a244e,#1A244E)',
    routeNodeStroke: 'color-mix(in srgb,var(--pn-8caaff,#8CAAFF) 40%,transparent)',
    routeCore: 'var(--pn-5ecef0,#5ECEF0)',
    routeNum: 'var(--pn-5ecef0,#5ECEF0)',
    routeLabel: 'var(--pn-c8d3f2,#C8D3F2)',
    cardBar: ['#2B5FA8', '#3E7FE0', '#4497DB', '#5ECEF0'],
  },
}

/** Card dark/light props derivadas da marca (passadas ao wrapper do <LoginForm>). */
export function cardSurface(c: MeqChrome): CSSProperties {
  return {
    background: c.cardBg,
    border: `1px solid ${c.cardBorder}`,
    color: c.cardFg,
  }
}

// ── Circuito de fundo (3 traços draw + 3 pulsos) ──────────────────────────────
// `prefix` dá o namespace das classes (.{prefix}-ol/.{prefix}-pl…) definidas no
// <style> da variante. `style` posiciona o SVG (varia por variante).
export function CircuitBg({
  prefix,
  chrome,
  strokeWidthOl,
  strokeWidthPl,
  style,
}: {
  prefix: string
  chrome: MeqChrome
  strokeWidthOl: string
  strokeWidthPl: string
  style: CSSProperties
}) {
  return (
    <svg
      className={`${prefix}-circ`}
      viewBox="0 0 483 306"
      aria-hidden="true"
      style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', ...style }}
    >
      {MEQ_CIRC_PATHS.map((d, i) => (
        <path
          key={`ol${i}`}
          className={`${prefix}-ol`}
          pathLength={1000}
          fill="none"
          stroke={chrome.circOl.stroke}
          strokeOpacity={chrome.circOl.opacity}
          strokeWidth={strokeWidthOl}
          strokeLinejoin="round"
          d={d}
        />
      ))}
      {MEQ_CIRC_PATHS.map((d, i) => (
        <path
          key={`pl${i}`}
          className={`${prefix}-pl ${prefix}-pl${i + 1}`}
          pathLength={1000}
          fill="none"
          stroke={chrome.circPl}
          strokeWidth={strokeWidthPl}
          strokeLinecap="round"
          strokeLinejoin="round"
          d={d}
        />
      ))}
    </svg>
  )
}

// ── Lockup do header: marca MEQ (caixa + triângulos) + wordmark "MEQ Concursos" ─
export function HeaderLockup({ chrome, scale = 1 }: { chrome: MeqChrome; scale?: number }) {
  const markW = 58.4 * scale
  const markH = 46 * scale
  const wordW = 57.3 * scale
  const wordH = 25.3 * scale
  const wordMt = 10.5 * scale
  return (
    <div role="img" aria-label="MEQ Concursos" style={{ display: 'flex', alignItems: 'flex-start', gap: 6.5 * scale }}>
      <svg viewBox="-93 -100 636 501" aria-hidden="true" style={{ width: markW, height: markH, flexShrink: 0, overflow: 'visible' }}>
        <rect x="-93" y="-100" width="636" height="501" rx="74" fill={chrome.markBox} />
        <path fill={chrome.markTri} d={MEQ_MARK_PATH} />
      </svg>
      <svg viewBox="0 0 383 169" aria-hidden="true" style={{ width: wordW, height: wordH, flexShrink: 0, overflow: 'visible', marginTop: wordMt }}>
        <path fill={chrome.wordFill} d={W.m} />
        <path fill={chrome.wordFill} d={W.e} />
        <path fill={chrome.wordFill} d={W.q} />
        <path fill={chrome.wordSeg} d={W.sg0} />
        <path fill={chrome.wordSeg} d={W.sg1} />
        <path fill={chrome.wordSeg} d={W.sg2} />
        <path fill={chrome.wordSeg} d={W.sg3} />
        <path fill={chrome.wordFill} d={W.concursos} />
      </svg>
    </div>
  )
}

// ── Palavra(s) do título — configurável no console (tema.aparencia_auth.loginTicker) ──────────────
// `palavras` + `animar` vêm do tenant: sem animação OU 1 palavra → estático; com animação e 2+ palavras
// → ciclo vertical com keyframes GERADOS p/ N palavras (não mais 4 fixas). Fallback "Tribunais.".
export function Ticker({
  prefix,
  color,
  gradient,
  lineHeightEm = 1.1,
  palavras,
  animar = false,
}: {
  prefix: string
  color: string
  gradient?: string
  lineHeightEm?: number
  palavras?: string[] | null
  animar?: boolean
}) {
  const inner: CSSProperties = gradient
    ? {
        backgroundImage: gradient,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }
    : { color }
  const lista = (palavras ?? []).map((p) => (p ?? '').trim()).filter(Boolean)
  const words = lista.length ? lista : ['Tribunais.']

  // Estático: animação desligada ou só 1 palavra → mostra a primeira, sem ciclo.
  if (!animar || words.length < 2) {
    return (
      <span style={{ display: 'inline-block', lineHeight: `${lineHeightEm}em`, verticalAlign: 'top', ...inner }}>
        {words[0]}
      </span>
    )
  }

  // Animado: ciclo vertical com keyframes para N palavras (dwell + slide); repete a 1ª no fim p/ o
  // loop ser imperceptível. Cada variante tem prefix único (mlc/mld/mlt) → sem colisão de @keyframes.
  const n = words.length
  const anim = `${prefix}TickDyn`
  const cls = `${prefix}-tickdyn`
  const dur = Math.max(3, +(n * 1.9).toFixed(2))
  return (
    <span style={{ display: 'inline-block', height: `${lineHeightEm}em`, overflow: 'hidden', verticalAlign: 'top' }}>
      <style>{`${tickerKeyframes(anim, n, lineHeightEm)}.${cls}{animation:${anim} ${dur}s cubic-bezier(.6,.1,.2,1) infinite}`}</style>
      <span className={cls} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: `${lineHeightEm}em`, ...inner }}>
        {words.map((w, i) => <span key={i}>{w}</span>)}
        <span aria-hidden="true">{words[0]}</span>
      </span>
    </span>
  )
}

// Keyframes do ciclo vertical p/ N palavras: cada palavra fica parada ~68% da sua fatia e desliza no
// resto; ao fim (100%) chega em -N*linha (= repetição da 1ª) p/ o loop emendar sem salto.
function tickerKeyframes(name: string, n: number, lh: number): string {
  const slice = 100 / n
  const hold = 0.68
  const frames: string[] = []
  for (let i = 0; i < n; i++) {
    const y = (i * lh).toFixed(3)
    const start = (i * slice).toFixed(2)
    const end = (i * slice + slice * hold).toFixed(2)
    frames.push(`${start}%{transform:translateY(-${y}em)}`)
    frames.push(`${end}%{transform:translateY(-${y}em)}`)
  }
  frames.push(`100%{transform:translateY(-${(n * lh).toFixed(3)}em)}`)
  return `@keyframes ${name}{${frames.join('')}}`
}

// ── CSS base compartilhado (entradas up/pop, circuito, glow, ticker) ──────────
// Prefixado para não vazar entre variantes. reduced-motion no final.
export function baseCss(prefix: string) {
  return `
.${prefix}-root{position:relative;overflow:hidden;min-height:100vh;font-family:'Sora',sans-serif;display:flex;flex-direction:column}
.${prefix}-glow{animation:${prefix}Glow 7s ease-in-out infinite alternate}
.${prefix}-up{animation:${prefix}Up .9s cubic-bezier(.2,.8,.2,1) both}
.${prefix}-pop{animation:${prefix}Pop 1s cubic-bezier(.2,.8,.2,1) .5s both}
.${prefix}-d1{animation-delay:.15s}.${prefix}-d2{animation-delay:.3s}.${prefix}-d3{animation-delay:.45s}.${prefix}-d4{animation-delay:.6s}.${prefix}-d5{animation-delay:.8s}.${prefix}-d6{animation-delay:.95s}.${prefix}-d7{animation-delay:1.15s}
.${prefix}-ol{stroke-dasharray:1000;stroke-dashoffset:1000;animation:${prefix}Draw 3.2s cubic-bezier(.6,.1,.2,1) .2s forwards}
.${prefix}-pl{stroke-dasharray:46 954;stroke-dashoffset:1000;opacity:0;animation:${prefix}Fade .6s ease-out 3s forwards,${prefix}Pulse 9s linear 3s infinite}
.${prefix}-pl2{animation-delay:3.4s,3.4s;animation-duration:.6s,11s}
.${prefix}-pl3{animation-delay:3.8s,3.8s;animation-duration:.6s,7s}
.${prefix}-tick{animation:${prefix}Tick 4s cubic-bezier(.6,.1,.2,1) infinite}
@keyframes ${prefix}Up{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@keyframes ${prefix}Pop{from{opacity:0;transform:translateY(34px) scale(.97)}to{opacity:1;transform:none}}
@keyframes ${prefix}Fade{from{opacity:0}to{opacity:1}}
@keyframes ${prefix}Draw{to{stroke-dashoffset:0}}
@keyframes ${prefix}Pulse{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}
@keyframes ${prefix}Glow{from{opacity:.75;transform:translateX(-3%)}to{opacity:1;transform:translateX(3%)}}
@keyframes ${prefix}Tick{0%{transform:translateY(0)}20%,45%{transform:translateY(-1.1em)}65%,90%{transform:translateY(-2.2em)}100%{transform:translateY(-3.3em)}}
`
}

export function reducedMotionCss(prefix: string) {
  return `@media (prefers-reduced-motion:reduce){.${prefix}-root *{animation:none!important}.${prefix}-ol{stroke-dashoffset:0}.${prefix}-pl{opacity:0}}`
}
