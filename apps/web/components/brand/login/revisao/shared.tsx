'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Peças compartilhadas das variantes de LOGIN da Revisão (spec 02 §2.3 / §5.2).
// Paleta exata dos mockups (hex hardcoded = correto p/ telas branded), tokens do
// <LoginForm>, e geradores das decorações (grade, marca d'água, traço, quadrados,
// formas). Cada LAYOUT (classico/lista/codigo) injeta seu próprio <style> com um
// prefixo único; aqui só expomos dados + JSX de decoração sem CSS próprio.
// ─────────────────────────────────────────────────────────────────────────────

import { MarcaRevisao, REVISAO_R_PATH, REVISAO_R_OUTLINE } from '../../brand-marks'
import type { LoginFormTokens } from '../types'

export type RevTheme = 'claro' | 'escuro'
export type Efeito = 'nenhum' | 'quadrados' | 'formas' | 'efeitos'

// ── Fundo da página (§5.2) ───────────────────────────────────────────────────
export const BG: Record<RevTheme, string> = {
  claro: 'linear-gradient(150deg,#2E1F7A 0%,#4A31B8 55%,#7356E6 100%)',
  escuro: 'linear-gradient(150deg,#0B0720 0%,#140C38 50%,#1F1352 100%)',
}
// Cor do rodapé / copyright
export const FOOT: Record<RevTheme, string> = { claro: '#D4C9FA', escuro: '#8E82BF' }
// Alpha das linhas da grade
export const LINES_A: Record<RevTheme, string> = { claro: '0.07', escuro: '0.05' }
// Degradê escuro da base
export const BAND: Record<RevTheme, string> = {
  claro: 'linear-gradient(180deg,rgba(30,18,80,0),rgba(30,18,80,.35))',
  escuro: 'linear-gradient(180deg,rgba(5,3,18,0),rgba(5,3,18,.55))',
}

// ── Tokens do <LoginForm> por tema (campos/CTA/links/pílula) ──────────────────
export const TOKENS: Record<RevTheme, LoginFormTokens> = {
  claro: {
    fg: '#1D1933',
    muted: '#6E6886',
    fieldBg: '#F8F7FC',
    fieldBorder: '#E5E1F0',
    fieldFg: '#1D1933',
    primary: '#5B3FD0',
    ctaBg: 'linear-gradient(180deg,#6449E0,#4B30BE)',
    ctaFg: '#FFFFFF',
    pillBg: 'rgba(255,255,255,.08)',
    pillFg: '#FFFFFF',
    pillBorder: 'rgba(255,255,255,.26)',
  },
  escuro: {
    fg: '#FFFFFF',
    muted: '#A69FC6',
    fieldBg: 'rgba(255,255,255,.04)',
    fieldBorder: 'rgba(185,168,255,.18)',
    fieldFg: '#FFFFFF',
    primary: '#8F75FF',
    ctaBg: 'linear-gradient(180deg,#6449E0,#4B30BE)',
    ctaFg: '#FFFFFF',
    pillBg: 'rgba(255,255,255,.08)',
    pillFg: '#FFFFFF',
    pillBorder: 'rgba(255,255,255,.26)',
  },
}

// Cor da tinta do card (claro = branco, escuro = gradiente roxo) p/ o slot.
export const CARD_BG: Record<RevTheme, string> = {
  claro: '#FFFFFF',
  escuro: 'linear-gradient(180deg,#1C1440,#140E30)',
}
export const CARD_BORDER: Record<RevTheme, string> = {
  claro: '1px solid rgba(229,225,240,.9)',
  escuro: '1px solid rgba(185,168,255,.16)',
}

// ── Quadrados piscando (efeito "quadrados"/"formas"/"efeitos") ────────────────
// Posições alinhadas à grade de 63px (mockups). Cores lilás/pêssego.
const PX_LILAS = 'rgba(185,168,255,.26)'
const PX_PESSEGO = 'rgba(255,196,163,.20)'
type PxSpec = { left: number; top: number; cor: string; delay: number }
const PX_DESKTOP: PxSpec[] = [
  { left: 1, top: 833, cor: PX_LILAS, delay: 3.54 },
  { left: 65, top: 1, cor: PX_PESSEGO, delay: 2.02 },
  { left: 65, top: 577, cor: PX_PESSEGO, delay: 5.14 },
  { left: 257, top: 65, cor: PX_LILAS, delay: 4.97 },
  { left: 321, top: 65, cor: PX_PESSEGO, delay: 7.87 },
  { left: 321, top: 577, cor: PX_PESSEGO, delay: 5.54 },
  { left: 321, top: 769, cor: PX_LILAS, delay: 6.41 },
  { left: 385, top: 897, cor: PX_PESSEGO, delay: 5.4 },
  { left: 769, top: 449, cor: PX_PESSEGO, delay: 6.57 },
  { left: 897, top: 257, cor: PX_LILAS, delay: 5.09 },
  { left: 897, top: 449, cor: PX_PESSEGO, delay: 3.8 },
  { left: 897, top: 833, cor: PX_PESSEGO, delay: 8.98 },
  { left: 1025, top: 65, cor: PX_LILAS, delay: 8.97 },
  { left: 1025, top: 449, cor: PX_PESSEGO, delay: 7.85 },
  { left: 1025, top: 833, cor: PX_PESSEGO, delay: 6.9 },
  { left: 1089, top: 769, cor: PX_LILAS, delay: 4.07 },
  { left: 1089, top: 833, cor: PX_PESSEGO, delay: 3.45 },
  { left: 1153, top: 193, cor: PX_PESSEGO, delay: 3.88 },
  { left: 1217, top: 641, cor: PX_LILAS, delay: 2.31 },
  { left: 1281, top: 577, cor: PX_PESSEGO, delay: 7.32 },
  { left: 1281, top: 705, cor: PX_PESSEGO, delay: 4.68 },
  { left: 1409, top: 641, cor: PX_LILAS, delay: 7.9 },
]

/** Quadrados piscando. `prefixo` = classe scoped (ex.: 'rlc'); `pan` liga o pxPan. */
export function Quadrados({ prefixo, pan, mask }: { prefixo: string; pan?: boolean; mask?: string }) {
  return (
    <div className={`${prefixo}-pxw`} aria-hidden="true" style={mask ? { WebkitMaskImage: mask, maskImage: mask } : undefined}>
      <div className={`${prefixo}-pxm${pan ? ` ${prefixo}-pan` : ''}`}>
        {PX_DESKTOP.map((p, i) => (
          <span
            key={i}
            className={`${prefixo}-px`}
            style={{ left: p.left, top: p.top, width: 63, height: 63, background: p.cor, animationDelay: `${p.delay}s` }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Formas subindo (efeito "formas"/"efeitos") ───────────────────────────────
type ShSpec = { left: string; w?: number; h?: number; cor?: string; raio?: string; plus?: boolean; dur: number; delay: number }
const SH_DESKTOP: ShSpec[] = [
  { left: '9%', w: 18, h: 18, cor: 'rgba(255,255,255,.35)', raio: '4px', dur: 22, delay: 0 },
  { left: '22%', w: 12, h: 12, cor: 'rgba(255,196,163,.55)', raio: '50%', dur: 18, delay: -6 },
  { left: '36%', w: 22, h: 22, cor: 'rgba(255,255,255,.25)', raio: '50%', dur: 26, delay: -14 },
  { left: '58%', w: 14, h: 14, cor: 'rgba(255,255,255,.3)', raio: '3px', dur: 20, delay: -3 },
  { left: '70%', w: 20, h: 20, cor: 'rgba(255,196,163,.5)', raio: '5px', dur: 24, delay: -10 },
  { left: '82%', w: 10, h: 10, cor: 'rgba(255,255,255,.35)', raio: '50%', dur: 17, delay: -8 },
  { left: '92%', w: 16, h: 16, cor: 'rgba(255,255,255,.25)', raio: '4px', dur: 21, delay: -16 },
  { left: '15%', plus: true, dur: 25, delay: -12 },
  { left: '47%', plus: true, dur: 23, delay: -19 },
  { left: '76%', plus: true, dur: 27, delay: -4 },
]

/** Formas subindo (quadrados/círculos contornados + cruzes). `prefixo` scoped. */
export function Formas({ prefixo }: { prefixo: string }) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {SH_DESKTOP.map((s, i) =>
        s.plus ? (
          <span key={i} className={`${prefixo}-sh ${prefixo}-plus`} style={{ left: s.left, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }} />
        ) : (
          <span
            key={i}
            className={`${prefixo}-sh`}
            style={{ left: s.left, width: s.w, height: s.h, border: `1.5px solid ${s.cor}`, borderRadius: s.raio, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }}
          />
        ),
      )}
    </div>
  )
}

// Reexport dos paths da marca p/ os layouts.
export { MarcaRevisao, REVISAO_R_PATH, REVISAO_R_OUTLINE }

// Header "Revisão / ENSINO JURÍDICO" (comum ao clássico). Sem botão de Ajuda.
export function HeaderRevisao({ prefixo }: { prefixo: string }) {
  return (
    <header className={`${prefixo}-head ${prefixo}-up`}>
      <div className={`${prefixo}-brand`}>
        <svg viewBox="0 0 68 66" width="34" height="33" aria-hidden="true">
          <path fillRule="evenodd" fill="#FFFFFF" d={REVISAO_R_PATH} />
        </svg>
        <div className={`${prefixo}-brandtxt`}>
          <span className={`${prefixo}-brandname`}>Revisão</span>
          <span className={`${prefixo}-brandsub`}>ENSINO JURÍDICO</span>
        </div>
      </div>
    </header>
  )
}
