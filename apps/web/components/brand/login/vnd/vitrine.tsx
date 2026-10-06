'use client'

// VND · LOGIN VITRINE (spec 02 §2.4 "vitrine") — mockups LoginV3*.
// 2 colunas: à esquerda SIMULA + lockup V+ND + H1 + 3 cards de recurso;
// à direita o card com anel conic girando + halo + CTA com shine. Circuito ao fundo.
// Fundo verde-escuro (escuro mesmo no claro). Prefixo: vlv-.

import { LoginForm } from '../login-form'
import type { LoginFormTokens, LoginVariantProps } from '../types'
import { VND_V_PATH } from '../../brand-marks'
import { HeaderMarca, AjudaBtn, SimulaLockup, LockupVND, Uline, LineIcon } from './shared'

const P = 'vlv'

const TOKENS: Record<'claro' | 'escuro', LoginFormTokens> = {
  claro: {
    fg: '#101C16', muted: '#5C6B62', fieldBg: '#F8FAF9', fieldBorder: '#E1E8E3', fieldFg: '#101C16',
    primary: '#0F7A44', ctaBg: 'linear-gradient(180deg,#14924F,#0C6E3C)', ctaFg: '#ffffff',
    pillBg: 'rgba(255,255,255,.06)', pillFg: '#D4EADD', pillBorder: 'rgba(255,255,255,.16)',
  },
  escuro: {
    fg: '#FFFFFF', muted: '#A9C2B5', fieldBg: 'rgba(255,255,255,.04)', fieldBorder: 'rgba(120,230,170,.16)', fieldFg: '#FFFFFF',
    primary: '#3FD58A', ctaBg: 'linear-gradient(180deg,#14924F,#0C6E3C)', ctaFg: '#ffffff',
    pillBg: 'rgba(255,255,255,.06)', pillFg: '#D4EADD', pillBorder: 'rgba(255,255,255,.16)',
  },
}

const PAGE_BG = {
  claro: 'linear-gradient(160deg,#041A10 0%,#072D1C 45%,#0B3D26 100%)',
  escuro: 'linear-gradient(180deg,#020906 0%,#03100A 50%,#051A10 100%)',
}
const CARD_BG = {
  claro: '#FFFFFF',
  escuro: 'linear-gradient(180deg,#0D1F16,#08140E)',
}

const FCARDS = [
  { icon: <><rect x={8} y={2} width={8} height={4} rx={1} /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>, t: 'Simulados', s: 'Correção automática', c: 'c1' },
  { icon: <><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>, t: 'Evolução', s: 'Acompanhe cada tentativa', c: 'c2' },
  { icon: <><path d="M3 3v18h18" /><path d="M18 17V9M13 17V5M8 17v-3" /></>, t: 'Desempenho', s: 'Por matéria e tema', c: 'c3' },
]

export function VndVitrine({ theme, core, preview, simula }: LoginVariantProps & { simula: boolean }) {
  const t = theme === 'escuro' ? 'escuro' : 'claro'
  const circOp = t === 'claro' ? 0.26 : 0.2
  const glowA = t === 'claro' ? 'rgba(34,197,110,0.3)' : 'rgba(34,197,110,0.16)'
  const fcardBg = t === 'claro' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.035)'

  return (
    <div
      className={`${P}-root`}
      style={{
        position: 'relative', overflow: 'hidden', minHeight: '100vh', background: PAGE_BG[t],
        fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#FFFFFF', display: 'flex', flexDirection: 'column',
      }}
    >
      <style>{css}</style>

      <div className={`${P}-grid`} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div className={`${P}-glowIn`} aria-hidden="true" style={{ position: 'absolute', width: 1100, height: 1100, left: '18%', top: '50%', margin: '-550px 0 0 -550px', background: `radial-gradient(closest-side,${glowA},rgba(34,197,110,0))`, pointerEvents: 'none' }} />
      <div className={`${P}-glowIn`} aria-hidden="true" style={{ position: 'absolute', width: 720, height: 720, right: -240, bottom: -280, background: 'radial-gradient(closest-side,rgba(52,200,140,0.24),rgba(52,200,140,0))', pointerEvents: 'none' }} />

      {/* circuito (V) ao fundo */}
      <svg className={`${P}-circ`} viewBox="0.6 5.4 31 21.3" aria-hidden="true" style={{ position: 'absolute', left: -300, top: -380, width: 2100, height: 1443, overflow: 'visible', pointerEvents: 'none' }}>
        <path className={`${P}-ol`} pathLength={1000} fill="none" stroke="#5FD69B" strokeOpacity={circOp} strokeWidth={0.0177} d={VND_V_PATH} />
        <path className={`${P}-pl ${P}-pl1`} pathLength={1000} fill="none" stroke="#E8C877" strokeWidth={0.0325} strokeLinecap="round" d={VND_V_PATH} />
        <path className={`${P}-pl ${P}-pl2`} pathLength={1000} fill="none" stroke="#E8C877" strokeWidth={0.0325} strokeLinecap="round" d={VND_V_PATH} />
      </svg>
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 220, background: `linear-gradient(180deg,rgba(2,9,6,0),rgba(2,9,6,${t === 'claro' ? 0.35 : 0.6}))`, pointerEvents: 'none' }} />

      <header className={`${P}-up ${P}-d0 ${P}-header`} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '28px 44px 0' }}>
        <HeaderMarca />
        <AjudaBtn cls={`${P}-ghost`} />
      </header>

      <main className={`${P}-main`} style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 88, padding: '24px 96px 96px', boxSizing: 'border-box' }}>
        {/* coluna esquerda */}
        <section className={`${P}-left`} style={{ flex: 1, maxWidth: 580, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 26, textAlign: 'left' }}>
          <div className={`${P}-up ${P}-d1`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 18 }}>
            <SimulaLockup P={P} simula={simula} align="start" />
            <LockupVND P={P} scale={0.767} gradId="vlvVg" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h1 className={`${P}-up ${P}-d2 ${P}-h1`} style={{ margin: 0, fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.045em' }}>
              Sua preparação<br />começa{' '}
              <span style={{ position: 'relative', display: 'inline-block', color: '#3FD58A' }}>aqui.<Uline P={P} /></span>
            </h1>
            <p className={`${P}-up ${P}-d3`} style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: '#B7D3C3', maxWidth: 440 }}>
              Simulados no padrão das provas da Defensoria, com correção na hora e a sua evolução sempre à vista.
            </p>
          </div>
          <div className={`${P}-fcards`} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, width: '100%', maxWidth: 560 }}>
            {FCARDS.map((f) => (
              <div key={f.t} className={`${P}-fcard ${P}-up ${P}-${f.c}`} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 18, background: fcardBg, border: '1px solid rgba(120,230,170,.14)', textAlign: 'left' }}>
                <span style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(63,213,138,.14)', color: '#3FD58A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LineIcon size={17} d={f.icon} />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <b style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF' }}>{f.t}</b>
                  <span style={{ fontSize: 12.5, color: '#A9C2B5' }}>{f.s}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* card à direita */}
        <div className={`${P}-pop ${P}-cardwrap`} style={{ position: 'relative', width: '100%', maxWidth: 430, flexShrink: 0 }}>
          <div className={`${P}-ring`} aria-hidden="true" style={{ position: 'absolute', inset: -1.5, borderRadius: 30, overflow: 'hidden', pointerEvents: 'none' }}>
            <span className={`${P}-spin`} style={{ position: 'absolute', left: '50%', top: '50%', width: '160%', aspectRatio: '1', margin: '-80% 0 0 -80%', background: 'conic-gradient(from 0deg, rgba(63,213,138,0) 0deg, rgba(63,213,138,.9) 60deg, rgba(232,200,119,.9) 110deg, rgba(63,213,138,0) 170deg, rgba(63,213,138,0) 360deg)' }} />
          </div>
          <div className={`${P}-halo`} aria-hidden="true" style={{ position: 'absolute', inset: -16, borderRadius: 40, background: 'radial-gradient(closest-side, rgba(63,213,138,.35), rgba(63,213,138,0))', filter: 'blur(18px)', pointerEvents: 'none' }} />
          <div className={`${P}-card`} style={{ position: 'relative', background: CARD_BG[t], color: TOKENS[t].fg, borderRadius: 28, padding: 32, boxSizing: 'border-box', boxShadow: '0 40px 80px -30px rgba(0,0,0,.7)', textAlign: 'left', border: t === 'escuro' ? '1px solid rgba(120,230,170,.16)' : 'none' }}>
            <LoginForm brand="vnd" theme={theme} core={core} tokens={TOKENS[t]} preview={preview}
              centro={false} mostrarTitulo tituloAluno="Entrar" ctaLabel="Entrar" />
          </div>
        </div>
      </main>

      <footer className={`${P}-up ${P}-d7 ${P}-foot`} style={{ position: 'absolute', left: 44, bottom: 26, fontSize: 12, color: '#7FA893' }}>© 2026 Você na Defensoria</footer>
    </div>
  )
}

const css = `
.${P}-root a{color:#3FD58A}
.${P}-grid{background-image:radial-gradient(circle,rgba(140,240,185,.2) 1.2px,transparent 1.8px);background-size:28px 28px;-webkit-mask-image:radial-gradient(ellipse 70% 70% at 40% 45%,#000 25%,transparent 85%);mask-image:radial-gradient(ellipse 70% 70% at 40% 45%,#000 25%,transparent 85%);animation:${P}-fade 1.4s ease-out both, ${P}-pan 40s linear 1.4s infinite}
.${P}-h1{font-size:54px}
.${P}-ghost{transition:background .2s,color .2s}.${P}-ghost:hover{background:rgba(255,255,255,.12);color:#FFFFFF}
.${P}-fcard{transition:transform .2s,border-color .2s,background .2s}.${P}-fcard:hover{transform:translateY(-3px);border-color:rgba(63,213,138,.4)}

.${P}-glowIn{animation:${P}-fade 2s ease-out .2s both}
.${P}-circ .${P}-ol{stroke-dasharray:1000;stroke-dashoffset:1000;animation:${P}-draw 3.4s cubic-bezier(.6,.1,.2,1) .2s forwards}
.${P}-circ .${P}-pl{stroke-dasharray:40 960;stroke-dashoffset:1000;opacity:0;animation:${P}-fade .6s ease-out 3s forwards, ${P}-pulse 9s linear 3s infinite}
.${P}-circ .${P}-pl2{animation-delay:3.4s,7.5s}
.${P}-vdraw path{stroke-dasharray:1000;stroke-dashoffset:1000;animation:${P}-draw 1.4s cubic-bezier(.6,.1,.2,1) .4s forwards}
.${P}-vfill{animation:${P}-vfill .8s cubic-bezier(.2,.8,.2,1.2) 1.3s both}
.${P}-ndw{animation:${P}-ndin .8s cubic-bezier(.2,.8,.2,1) 1.5s both}
.${P}-uline path{stroke-dasharray:1;stroke-dashoffset:1;animation:${P}-draw .9s cubic-bezier(.6,.1,.2,1) 1.1s forwards}
.${P}-up{animation:${P}-up .9s cubic-bezier(.2,.8,.2,1) both}
.${P}-d0{animation-delay:.1s}.${P}-d1{animation-delay:.2s}.${P}-d2{animation-delay:.45s}.${P}-d3{animation-delay:.6s}.${P}-d7{animation-delay:1.4s}
.${P}-c1{animation-delay:1.3s}.${P}-c2{animation-delay:1.45s}.${P}-c3{animation-delay:1.6s}
.${P}-pop{animation:${P}-pop 1s cubic-bezier(.2,.8,.2,1) .7s both}
.${P}-ring{-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;padding:1.5px;animation:${P}-fade 1s ease-out 1.6s both}
.${P}-spin{animation:${P}-spin 6s linear infinite}
.${P}-halo{animation:${P}-fade 1.4s ease-out 1s both, ${P}-breathe 5s ease-in-out 2.4s infinite alternate}

.${P}-sl{display:inline-block;animation:${P}-slk .6s cubic-bezier(.2,.8,.2,1) both}
.${P}-s1{animation-delay:.35s}.${P}-s2{animation-delay:.43s}.${P}-s3{animation-delay:.51s}.${P}-s4{animation-delay:.59s}.${P}-s5{animation-delay:.67s}.${P}-s6{animation-delay:.75s}
.${P}-simline{transform-origin:0 50%;animation:${P}-grow .7s cubic-bezier(.6,.1,.2,1) .9s both}

@keyframes ${P}-fade{from{opacity:0}to{opacity:1}}
@keyframes ${P}-pan{from{background-position:0 0}to{background-position:56px 112px}}
@keyframes ${P}-draw{to{stroke-dashoffset:0}}
@keyframes ${P}-pulse{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}
@keyframes ${P}-vfill{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:none}}
@keyframes ${P}-ndin{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}}
@keyframes ${P}-up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes ${P}-pop{from{opacity:0;transform:translateY(40px) scale(.96)}to{opacity:1;transform:none}}
@keyframes ${P}-spin{to{transform:rotate(360deg)}}
@keyframes ${P}-breathe{from{opacity:.55}to{opacity:1}}
@keyframes ${P}-slk{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes ${P}-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}

@media (max-width:980px){
  .${P}-main{flex-direction:column;gap:40px;padding:24px 32px 96px}
  .${P}-left{max-width:430px;align-items:center;text-align:center}
  .${P}-left .${P}-h1,.${P}-left p{text-align:center}
}
@media (max-width:640px){
  .${P}-header{padding:20px 18px 0}
  .${P}-main{padding:16px 16px 92px;gap:28px}
  .${P}-h1{font-size:34px}
  .${P}-grid{background-size:20px 20px}
  .${P}-fcards{grid-template-columns:1fr;max-width:none}
  .${P}-fcard:nth-child(3){display:none}
  .${P}-foot{left:18px;bottom:20px}
}
@media (prefers-reduced-motion:reduce){
  .${P}-root *{animation:none!important}
  .${P}-vdraw path,.${P}-uline path,.${P}-circ .${P}-ol{stroke-dashoffset:0}
}
`
