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
    bg: 'linear-gradient(180deg,#F6F9FE 0%,#EEF3FB 55%,#E3ECF8 100%)',
    glowBg: 'radial-gradient(closest-side, rgba(94,206,240,.35), rgba(94,206,240,0))',
    circOl: { stroke: '#306AB5', opacity: '0.2' },
    circPl: '#3E7FE0',
    markBox: '#306AB5',
    markTri: '#FFFFFF',
    wordFill: '#171E3B',
    wordSeg: '#3E7FE0',
    h1: '#171E3B',
    tickerColor: '#2F64C8',
    tickerGradient: 'linear-gradient(90deg,#2F64C8,#3E9FDB 50%,#306AB5)',
    tickerDividido: '#2F64C8',
    tickerTrilhaColor: '#2F64C8',
    para: '#56628A',
    eyebrow: '#306AB5',
    cardTitle: '#171E3B',
    cardBg: '#FFFFFF',
    cardBorder: '#DCE3F2',
    cardFg: '#171E3B',
    gaugeBar: '#3E7FE0',
    chip: '#3B4670',
    chipIcon: '#306AB5',
    foot: '#7D89AE',
    chipBg: 'rgba(48,106,181,.07)',
    chipBorder: 'rgba(48,106,181,.18)',
    chipFg: '#3B4670',
    stepBase: 'rgba(48,106,181,.08)',
    stepBorder: 'rgba(48,106,181,.25)',
    stepNumFg: '#306AB5',
    stepLitBg: '#306AB5',
    stepLitFg: '#FFFFFF',
    stepTitle: '#171E3B',
    stepDesc: '#66729A',
    routeBase: 'rgba(48,106,181,.28)',
    routePulse: '#3E7FE0',
    routeNode: '#FFFFFF',
    routeNodeStroke: 'rgba(48,106,181,.28)',
    routeCore: '#3E7FE0',
    routeNum: '#306AB5',
    routeLabel: '#3B4670',
    cardBar: ['#2B5FA8', '#3E7FE0', '#4497DB', '#5ECEF0'],
  },
  azul: {
    bg: 'linear-gradient(160deg,#2B5FA8 0%,#306AB5 40%,#4497DB 100%)',
    glowBg: 'radial-gradient(closest-side, rgba(94,206,240,.6), rgba(94,206,240,0))',
    circOl: { stroke: '#8BEAEA', opacity: '0.45' },
    circPl: '#FFFFFF',
    markBox: '#FFFFFF',
    markTri: '#171E3B',
    wordFill: '#FFFFFF',
    wordSeg: '#8BEAEA',
    h1: '#FFFFFF',
    tickerColor: '#8BEAEA',
    tickerDividido: '#8BEAEA',
    tickerTrilhaColor: '#8BEAEA',
    para: '#E3F4FF',
    eyebrow: '#306AB5',
    cardTitle: '#171E3B',
    cardBg: '#FFFFFF',
    cardBorder: '#DCE3F2',
    cardFg: '#171E3B',
    gaugeBar: '#3E7FE0',
    chip: '#E3F4FF',
    chipIcon: '#FFFFFF',
    foot: '#DCEBFF',
    chipBg: 'rgba(255,255,255,.12)',
    chipBorder: 'rgba(255,255,255,.28)',
    chipFg: '#E3F4FF',
    stepBase: 'rgba(255,255,255,.14)',
    stepBorder: 'rgba(255,255,255,.28)',
    stepNumFg: '#FFFFFF',
    stepLitBg: '#171E3B',
    stepLitFg: null,
    stepTitle: '#FFFFFF',
    stepDesc: '#DCEBFF',
    routeBase: 'rgba(255,255,255,.35)',
    routePulse: '#8BEAEA',
    routeNode: '#2B5FA8',
    routeNodeStroke: 'rgba(255,255,255,.5)',
    routeCore: '#8BEAEA',
    routeNum: '#FFFFFF',
    routeLabel: '#E3F4FF',
    cardBar: ['#2B5FA8', '#3E7FE0', '#4497DB', '#5ECEF0'],
  },
  escuro: {
    bg: 'linear-gradient(180deg,#121A3A 0%,#141B38 55%,#0B1124 100%)',
    glowBg: 'radial-gradient(closest-side, rgba(62,127,224,.55), rgba(62,127,224,0))',
    circOl: { stroke: '#5E8EF0', opacity: '0.4' },
    circPl: '#8BEAEA',
    markBox: '#FFFFFF',
    markTri: '#306AB5',
    wordFill: '#FFFFFF',
    wordSeg: '#5ECEF0',
    h1: '#FFFFFF',
    tickerColor: '#5ECEF0',
    tickerGradient: 'linear-gradient(90deg,#5ECEF0,#8BEAEA 45%,#7FA8FF)',
    tickerDividido: '#8BEAEA',
    tickerTrilhaColor: 'transparent',
    tickerTrilhaGradient: 'linear-gradient(90deg,#5ECEF0,#8BEAEA 45%,#7FA8FF)',
    para: '#A9B6D9',
    eyebrow: '#5ECEF0',
    cardTitle: '#FFFFFF',
    cardBg: 'linear-gradient(180deg,rgba(26,36,78,.82),rgba(14,21,49,.88))',
    cardBorder: 'rgba(140,170,255,.2)',
    cardFg: '#FFFFFF',
    gaugeBar: '#5ECEF0',
    chip: '#C8D3F2',
    chipIcon: '#5ECEF0',
    foot: '#7F8BB3',
    chipBg: 'rgba(140,170,255,.08)',
    chipBorder: 'rgba(140,170,255,.2)',
    chipFg: '#C8D3F2',
    stepBase: 'rgba(140,170,255,.1)',
    stepBorder: 'rgba(140,170,255,.28)',
    stepNumFg: '#FFFFFF',
    stepLitBg: '#3E7FE0',
    stepLitFg: null,
    stepTitle: '#FFFFFF',
    stepDesc: '#A9B6D9',
    routeBase: 'rgba(140,170,255,.32)',
    routePulse: '#5ECEF0',
    routeNode: '#1A244E',
    routeNodeStroke: 'rgba(140,170,255,.4)',
    routeCore: '#5ECEF0',
    routeNum: '#5ECEF0',
    routeLabel: '#C8D3F2',
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

// ── Ticker vertical "Tribunais./Polícias./Fiscais." (tickA 4s) ────────────────
// A classe de animação (.{prefix}-tick) vem do <style> da variante.
// `gradient` (opcional) pinta o texto com gradiente; senão usa `color`.
export function Ticker({
  prefix,
  color,
  gradient,
  lineHeightEm = 1.1,
}: {
  prefix: string
  color: string
  gradient?: string
  lineHeightEm?: number
}) {
  const inner: CSSProperties = gradient
    ? {
        backgroundImage: gradient,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }
    : { color }
  return (
    <span style={{ display: 'inline-block', height: `${lineHeightEm}em`, overflow: 'hidden', verticalAlign: 'top' }}>
      <span
        className={`${prefix}-tick`}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: `${lineHeightEm}em`, ...inner }}
      >
        <span>Tribunais.</span>
        <span>Polícias.</span>
        <span>Fiscais.</span>
        <span>Tribunais.</span>
      </span>
    </span>
  )
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
