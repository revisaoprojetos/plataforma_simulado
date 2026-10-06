'use client'

// VND · LOGIN CENTRALIZADO (spec 02 §2.4 "centralizado") — mockups LoginVND4*.
// Fundo verde-escuro (escuro MESMO no tema claro), grade de pontos, "V" gigante
// 980px desenhado com ecos, headline centralizada, card abaixo com chips.
// Prefixo de classe: vlc-. Simula letra a letra + linha dourada (opcional).

import { LoginForm } from '../login-form'
import type { LoginFormTokens, LoginVariantProps } from '../types'
import { VND_V_PATH } from '../../brand-marks'
import { HeaderMarca, AjudaBtn, SimulaLockup, Uline, LineIcon } from './shared'

const P = 'vlc'

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

// Fundo da PÁGINA: o claro usa um verde-escuro levemente mais claro; o escuro é quase preto.
const PAGE_BG = {
  claro: 'linear-gradient(180deg,#041A10 0%,#072D1C 50%,#0B3D26 100%)',
  escuro: 'linear-gradient(180deg,#020906 0%,#03100A 50%,#051A10 100%)',
}
// O card: branco no claro, vidro verde no escuro.
const CARD_BG = {
  claro: '#FFFFFF',
  escuro: 'linear-gradient(180deg,#0D1F16,#08140E)',
}

export function VndCentralizado({ theme, core, preview, simula }: LoginVariantProps & { simula: boolean }) {
  const t = theme === 'escuro' ? 'escuro' : 'claro'
  const glowA = t === 'claro' ? 'rgba(34,197,110,.34)' : 'rgba(34,197,110,.2)'
  const glowB = t === 'claro' ? 'rgba(52,200,140,.24)' : 'rgba(52,200,140,.14)'

  return (
    <div
      className={`${P}-root`}
      style={{
        position: 'relative', overflow: 'hidden', minHeight: '100vh', background: PAGE_BG[t],
        fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#FFFFFF', display: 'flex', flexDirection: 'column',
      }}
    >
      <style>{css}</style>

      {/* grade + glows */}
      <div className={`${P}-grid ${P}-gridIn`} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div className={`${P}-glowIn`} aria-hidden="true" style={{ position: 'absolute', width: 1200, height: 1200, left: '50%', top: '50%', margin: '-660px 0 0 -600px', background: `radial-gradient(closest-side,${glowA},rgba(34,197,110,0))`, pointerEvents: 'none' }} />
      <div className={`${P}-glowIn`} aria-hidden="true" style={{ position: 'absolute', width: 720, height: 720, right: -240, bottom: -300, background: `radial-gradient(closest-side,${glowB},rgba(52,200,140,0))`, pointerEvents: 'none' }} />
      <div className={`${P}-glowIn`} aria-hidden="true" style={{ position: 'absolute', width: 720, height: 720, left: -260, top: -280, background: 'radial-gradient(closest-side,rgba(63,213,138,.2),rgba(63,213,138,0))', pointerEvents: 'none' }} />
      <div className={`${P}-glowIn`} aria-hidden="true" style={{ position: 'absolute', width: 520, height: 520, left: -160, bottom: -220, background: 'radial-gradient(closest-side,rgba(63,213,138,.12),rgba(63,213,138,0))', pointerEvents: 'none' }} />

      {/* V gigante */}
      <div className={`${P}-vwrap`} aria-hidden="true" style={{ position: 'absolute', width: 980, height: 980, left: '50%', top: '50%', margin: '-470px 0 0 -490px', pointerEvents: 'none' }}>
        <svg className={`${P}-vglow`} viewBox="0 0 32 32" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', filter: 'blur(46px)' }}>
          <path d={VND_V_PATH} fill="rgba(46,210,120,.32)" />
        </svg>
        <svg className={`${P}-vfill`} viewBox="0 0 32 32" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="vlcVg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0.18" stopColor="#3FD58A" stopOpacity="0.2" />
              <stop offset="0.55" stopColor="#3FD58A" stopOpacity="0.08" />
              <stop offset="0.8" stopColor="#3FD58A" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={VND_V_PATH} fill="url(#vlcVg)" />
        </svg>
        <svg className={`${P}-vdraw`} viewBox="0 0 32 32" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <path pathLength={1} d={VND_V_PATH} fill="none" stroke="rgba(140,240,185,.42)" strokeWidth={0.07} />
        </svg>
        <svg className={`${P}-echo ${P}-e1`} viewBox="0 0 32 32" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}><path d={VND_V_PATH} fill="none" stroke="rgba(120,230,170,.22)" strokeWidth={0.04} /></svg>
        <svg className={`${P}-echo ${P}-e2`} viewBox="0 0 32 32" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}><path d={VND_V_PATH} fill="none" stroke="rgba(216,180,90,.22)" strokeWidth={0.04} /></svg>
        <svg className={`${P}-echo ${P}-e3`} viewBox="0 0 32 32" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}><path d={VND_V_PATH} fill="none" stroke="rgba(120,230,170,.22)" strokeWidth={0.04} /></svg>
      </div>

      <header className={`${P}-up ${P}-d0 ${P}-header`} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '28px 40px 0' }}>
        <HeaderMarca />
        <AjudaBtn cls={`${P}-ghost`} />
      </header>

      <main className={`${P}-main`} style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '32px 24px 88px', boxSizing: 'border-box', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, maxWidth: 720 }}>
          <div className={`${P}-simwrap`} style={{ marginBottom: 4 }}>
            <SimulaLockup P={P} simula={simula} align="center" />
          </div>
          <h1 className={`${P}-up ${P}-d1 ${P}-h1`} style={{ margin: 0, fontWeight: 800, lineHeight: 1.04, letterSpacing: '-0.045em', color: '#FFFFFF' }}>
            Sua preparação começa{' '}
            <span style={{ position: 'relative', display: 'inline-block', color: '#3FD58A' }}>
              aqui.<Uline P={P} />
            </span>
          </h1>
          <p className={`${P}-up ${P}-d2`} style={{ margin: '6px 0 0', fontSize: 18, lineHeight: 1.6, color: '#B7D3C3' }}>
            Entre com o seu e-mail e continue de onde parou.
          </p>
        </div>

        {/* card */}
        <div className={`${P}-pop ${P}-cardwrap`} style={{ position: 'relative', width: '100%', maxWidth: 440 }}>
          <div className={`${P}-halo`} aria-hidden="true" style={{ position: 'absolute', inset: -14, borderRadius: 40, background: 'linear-gradient(160deg, rgba(63,213,138,.38), rgba(63,213,138,0) 45%, rgba(52,200,140,.26))', filter: 'blur(24px)', pointerEvents: 'none' }} />
          <div
            className={`${P}-card`}
            style={{
              position: 'relative', background: CARD_BG[t], color: TOKENS[t].fg, borderRadius: 28, padding: 32,
              boxSizing: 'border-box', boxShadow: '0 40px 80px -30px rgba(0,0,0,.7)', textAlign: 'left',
              border: t === 'escuro' ? '1px solid rgba(120,230,170,.16)' : 'none',
            }}
          >
            <LoginForm brand="vnd" theme={theme} core={core} tokens={TOKENS[t]} preview={preview}
              centro={false} mostrarTitulo tituloAluno="Entrar" ctaLabel="Entrar" />
          </div>
        </div>

        {/* chips */}
        <ul className={`${P}-chips`} style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
          <li className={`${P}-chip ${P}-up ${P}-c1`}>
            <span className={`${P}-chipi`} style={{ color: '#3FD58A' }}><LineIcon size={15} d={<><rect x={8} y={2} width={8} height={4} rx={1} /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>} /></span>
            Simulados e correção automática
          </li>
          <li className={`${P}-chip ${P}-up ${P}-c2`}>
            <span className={`${P}-chipi`} style={{ color: '#3FD58A' }}><LineIcon size={15} d={<><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>} /></span>
            Crescimento na Defensoria
          </li>
          <li className={`${P}-chip ${P}-up ${P}-c3`}>
            <span className={`${P}-chipi`} style={{ color: '#E8C877' }}><LineIcon size={15} d={<><path d="M3 3v18h18" /><path d="M18 17V9M13 17V5M8 17v-3" /></>} /></span>
            Desempenho e evolução num só lugar
          </li>
        </ul>
      </main>

      <footer className={`${P}-up ${P}-d7 ${P}-foot`} style={{ position: 'absolute', left: 40, bottom: 26, fontSize: 12, color: '#7FA893' }}>© 2026 Você na Defensoria</footer>
    </div>
  )
}

const css = `
.${P}-root a{color:#3FD58A}
.${P}-grid{background-image:radial-gradient(circle,rgba(140,240,185,.2) 1.2px,transparent 1.8px);background-size:28px 28px;-webkit-mask-image:radial-gradient(ellipse 60% 60% at 50% 45%,#000 25%,transparent 80%);mask-image:radial-gradient(ellipse 60% 60% at 50% 45%,#000 25%,transparent 80%)}
.${P}-h1{font-size:60px}
.${P}-ghost{transition:background .2s,color .2s}
.${P}-ghost:hover{background:rgba(255,255,255,.12);color:#FFFFFF}
.${P}-chip{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);font-size:13px;font-weight:600;color:#D4EADD;transition:background .2s,border-color .2s,transform .2s}
.${P}-chip:hover{background:rgba(63,213,138,.1);border-color:rgba(63,213,138,.35);transform:translateY(-2px)}
.${P}-chipi{display:inline-flex}

.${P}-gridIn{animation:${P}-fade 1.6s ease-out both, ${P}-drift 30s linear 1.6s infinite}
@keyframes ${P}-drift{from{background-position:0 0}to{background-position:0 -112px}}
.${P}-glowIn{animation:${P}-fade 2s ease-out .2s both}
.${P}-vdraw path{stroke-dasharray:1;stroke-dashoffset:1;animation:${P}-draw 2.4s cubic-bezier(.6,.1,.2,1) .3s forwards}
.${P}-vfill{animation:${P}-fade 1.6s ease-out 1.8s both}
.${P}-vglow{animation:${P}-fade 2s ease-out 1.6s both, ${P}-vpulse 5s ease-in-out 3.6s infinite alternate}
@keyframes ${P}-vpulse{from{opacity:.55}to{opacity:1}}
.${P}-vwrap{animation:${P}-breathe 10s ease-in-out 2.6s infinite alternate}
.${P}-echo{transform-origin:67% 80%;opacity:0;animation:${P}-echo 6s cubic-bezier(.2,.6,.3,1) infinite}
.${P}-e1{animation-delay:2.8s}.${P}-e2{animation-delay:4.8s}.${P}-e3{animation-delay:6.8s}
.${P}-up{animation:${P}-up .9s cubic-bezier(.2,.8,.2,1) both}
.${P}-d0{animation-delay:.1s}.${P}-d1{animation-delay:.3s}.${P}-d2{animation-delay:.45s}.${P}-d7{animation-delay:1.35s}
.${P}-c1{animation-delay:1.45s}.${P}-c2{animation-delay:1.55s}.${P}-c3{animation-delay:1.65s}
.${P}-pop{animation:${P}-pop 1s cubic-bezier(.2,.8,.2,1) .7s both}
.${P}-halo{animation:${P}-fade 1.4s ease-out 1s both, ${P}-halo 6s ease-in-out 2.4s infinite alternate}
.${P}-uline path{stroke-dasharray:1;stroke-dashoffset:1;animation:${P}-draw .9s cubic-bezier(.6,.1,.2,1) 1.05s forwards}

.${P}-sl{display:inline-block;animation:${P}-slk .6s cubic-bezier(.2,.8,.2,1) both}
.${P}-s1{animation-delay:.35s}.${P}-s2{animation-delay:.43s}.${P}-s3{animation-delay:.51s}.${P}-s4{animation-delay:.59s}.${P}-s5{animation-delay:.67s}.${P}-s6{animation-delay:.75s}
.${P}-simline{transform-origin:50% 50%;animation:${P}-grow .7s cubic-bezier(.6,.1,.2,1) .9s both}

@keyframes ${P}-fade{from{opacity:0}to{opacity:1}}
@keyframes ${P}-draw{to{stroke-dashoffset:0}}
@keyframes ${P}-breathe{to{transform:scale(1.025)}}
@keyframes ${P}-echo{0%{opacity:0;transform:scale(.55)}15%{opacity:.7}100%{opacity:0;transform:scale(1.15)}}
@keyframes ${P}-up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes ${P}-pop{from{opacity:0;transform:translateY(40px) scale(.96)}to{opacity:1;transform:none}}
@keyframes ${P}-halo{from{opacity:.65}to{opacity:1}}
@keyframes ${P}-slk{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes ${P}-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}

@media (max-width:640px){
  .${P}-header{padding:20px 18px 0}
  .${P}-main{padding:20px 16px 92px;gap:22px}
  .${P}-h1{font-size:34px}
  .${P}-grid{background-size:20px 20px}
  .${P}-vwrap{width:620px;height:620px;margin:-300px 0 0 -310px}
  .${P}-chips{display:none}
  .${P}-foot{left:18px;bottom:20px}
}
@media (prefers-reduced-motion:reduce){
  .${P}-root *{animation:none!important}
  .${P}-vdraw path,.${P}-uline path{stroke-dashoffset:0}
  .${P}-echo{opacity:0}
}
`
