'use client'

/**
 * Loading Revisão — CIRCUITO "estilo MEQ" (slugs `rev-loading-circuito`, `-circuito-efeitos`,
 * `-circuito-quadrados`). PORTE FIEL dos mockups `design/LoadingRevisao3*` /
 * `LoadingRevisaoQuad3*` / `LoadingRevisao3Efeito*` (claro/escuro).
 *
 * O "circuito" é o símbolo "R" da Revisão tratado como traçado (grade + R gigante no fundo com
 * contorno desenhando + pulsos pêssego viajando; no centro o R preenchido + contorno + pulso correndo).
 * Wordmark "REVISÃO / ENSINO JURÍDICO" + barra de progresso. Flags:
 *   - `efeitos`   → partículas flutuantes (formas subindo) + brilhos de pixel.
 *   - `quadrados` → só os brilhos de pixel (quadradinhos).
 *
 * Prefixo `rlc-`. reduced-motion mostra o estado final.
 */

import { RevisaoParticulas } from './revisao-particulas'

export type RevisaoCircTheme = 'claro' | 'escuro'

// Símbolo "R" (viewBox 5.4 4.9 57.2 56.7). `R_FULL` = R + barra (preenchimento); `R_OUT` = contorno externo (pulsos).
const R_FULL = 'M6 5.5H32C43.5 5.5 49 13 49 23C49 31 45 37 39.5 40.5L62 61H6Z M9.2 9.2H19.2V57.6H9.2Z'
const R_OUT = 'M6 5.5H32C43.5 5.5 49 13 49 23C49 31 45 37 39.5 40.5L62 61H6Z'

const BG: Record<RevisaoCircTheme, string> = {
  claro: 'linear-gradient(155deg,#2E1F7A 0%,#4A31B8 50%,#7356E6 100%)',
  escuro: 'linear-gradient(155deg,#0B0720 0%,#140C38 50%,#1F1352 100%)',
}
const FOOT: Record<RevisaoCircTheme, string> = { claro: '#D4C9FA', escuro: '#8E82BF' }
const GRID_A: Record<RevisaoCircTheme, string> = { claro: '.07', escuro: '.05' }
const OL_OP: Record<RevisaoCircTheme, number> = { claro: 0.28, escuro: 0.32 }

export function LoadingRevisaoCircuito({
  theme = 'claro', message, efeitos = false, quadrados = false,
}: {
  theme?: RevisaoCircTheme
  message?: string
  efeitos?: boolean
  quadrados?: boolean
}) {
  const foot = FOOT[theme]

  return (
    <div className="rlc-root">
      <style>{css(theme)}</style>

      <div className="rlc-grid" aria-hidden="true" />

      {/* Circuito de fundo: R gigante — contorno desenha + 3 pulsos pêssego viajam. */}
      <svg className="rlc-circ" viewBox="5.4 4.9 57.2 56.7" aria-hidden="true">
        <path className="rlc-ol" pathLength={1000} fill="none" stroke="#FFFFFF" strokeOpacity={OL_OP[theme]} strokeWidth={0.0458} d={R_FULL} />
        <path className="rlc-pl rlc-pl1" pathLength={1000} fill="none" stroke="#FFC4A3" strokeWidth={0.0839} strokeLinecap="round" d={R_OUT} />
        <path className="rlc-pl rlc-pl2" pathLength={1000} fill="none" stroke="#FFC4A3" strokeWidth={0.0839} strokeLinecap="round" d={R_OUT} />
        <path className="rlc-pl rlc-pl3" pathLength={1000} fill="none" stroke="#FFC4A3" strokeWidth={0.0839} strokeLinecap="round" d={R_OUT} />
      </svg>

      {/* Camadas de efeitos (compartilhadas): brilhos de pixel (quadrados) + formas flutuantes (efeitos). */}
      <RevisaoParticulas efeitos={efeitos} quadrados={quadrados} />

      <main role="status" aria-live="polite" className="rlc-main">
        <div className="rlc-mark">
          <svg className="rlc-mfill" viewBox="5.4 4.9 57.2 56.7" aria-hidden="true">
            <defs><linearGradient id="rlcG" x1="0" y1="0" x2="1" y2="1"><stop offset="0.1" stopColor="#FFFFFF" /><stop offset="0.9" stopColor="#D9CFFF" /></linearGradient></defs>
            <path fill="url(#rlcG)" fillRule="evenodd" d={R_FULL} />
          </svg>
          <svg className="rlc-mdraw" viewBox="5.4 4.9 57.2 56.7" aria-hidden="true"><path pathLength={1000} fill="none" stroke="#FFFFFF" strokeWidth={0.3661} strokeLinejoin="round" d={R_FULL} /></svg>
          <svg className="rlc-mrunbox" viewBox="3.112 2.612 61.776 61.276" aria-hidden="true"><path className="rlc-mrun" pathLength={1000} fill="none" stroke="#FFC4A3" strokeWidth={0.5949} strokeLinecap="round" d={R_OUT} /></svg>
        </div>

        <div className="rlc-wmk">
          <span className="rlc-wmk-nome">REVISÃO</span>
          <span className="rlc-sub">ENSINO JURÍDICO</span>
        </div>

        <div className="rlc-prog" role="img" aria-label="Carregando"><span className="rlc-runner" /></div>

        {message ? <p className="rlc-msg" style={{ color: foot }}>{message}</p> : null}
      </main>

      <div className="rlc-foot" style={{ color: foot }}>© 2026 Revisão Ensino Jurídico</div>
    </div>
  )
}

function css(theme: RevisaoCircTheme) {
  const a = GRID_A[theme]
  return `
.rlc-root{position:relative;overflow:hidden;min-height:100vh;width:100%;background:${BG[theme]};font-family:'Montserrat',sans-serif;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
.rlc-grid{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,${a}) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,${a}) 1px,transparent 1px);background-size:64px 64px;-webkit-mask-image:radial-gradient(ellipse 70% 70% at 50% 48%,#000 25%,transparent 85%);mask-image:radial-gradient(ellipse 70% 70% at 50% 48%,#000 25%,transparent 85%);animation:rlcFade 1.6s ease-out both}
.rlc-circ{position:absolute;left:-200px;top:-260px;width:1500px;height:1487px;overflow:visible;pointer-events:none}
.rlc-ol{stroke-dasharray:1000;stroke-dashoffset:1000;animation:rlcDraw 3.4s cubic-bezier(.6,.1,.2,1) .1s forwards}
.rlc-pl{stroke-dasharray:40 960;stroke-dashoffset:1000;opacity:0;animation:rlcFade .6s ease-out 2.6s forwards,rlcPulse 8s linear 2.6s infinite}
.rlc-pl2{animation-delay:3s,5.3s}.rlc-pl3{animation-delay:3.3s,8s}
.rlc-main{position:relative;display:flex;flex-direction:column;align-items:center;gap:44px;padding:24px}
.rlc-mark{position:relative;width:250px;height:248px;flex-shrink:0}
.rlc-mark svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.rlc-mfill{animation:rlcMfill .9s cubic-bezier(.2,.8,.2,1) 1.5s both}
.rlc-mdraw path{stroke-dasharray:1000;stroke-dashoffset:1000;animation:rlcDraw 1.6s cubic-bezier(.6,.1,.2,1) .3s forwards}
.rlc-mark .rlc-mrunbox{inset:auto;left:-10px;top:-10px;width:270px;height:267.8px}
.rlc-mrun{opacity:0;stroke-dasharray:70 930;animation:rlcFade .4s ease-out 2.4s forwards,rlcPulse 3.2s linear 2.4s infinite}
.rlc-wmk{display:flex;flex-direction:column;align-items:center;gap:14px;animation:rlcRise .9s cubic-bezier(.2,.8,.2,1) 1.9s both}
.rlc-wmk-nome{font-weight:800;font-size:64px;line-height:.8;letter-spacing:.01em;padding-top:.1em}
.rlc-sub{font-weight:500;font-size:21.8px;letter-spacing:.3em;padding-left:.3em;color:#E1D9FF;animation:rlcSubIn 1s cubic-bezier(.2,.8,.2,1) 2.2s both}
.rlc-prog{position:relative;width:340px;height:5px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.16);animation:rlcFade .8s ease-out 2.3s both}
.rlc-runner{position:absolute;top:0;left:0;height:100%;width:34%;border-radius:999px;background:linear-gradient(90deg,rgba(255,255,255,0),#FFFFFF 55%,#FFC4A3);transform:translateX(-110%);animation:rlcRun 1.6s cubic-bezier(.45,0,.55,1) 2.6s infinite}
.rlc-msg{margin:0;font-size:13px;font-weight:500;animation:rlcFade .4s ease-out 3s both}
.rlc-foot{position:absolute;bottom:26px;font-size:12px;animation:rlcFade 1s ease-out .4s both}
@keyframes rlcFade{from{opacity:0}to{opacity:1}}
@keyframes rlcDraw{to{stroke-dashoffset:0}}
@keyframes rlcPulse{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}
@keyframes rlcMfill{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
@keyframes rlcRise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes rlcSubIn{from{opacity:0;letter-spacing:.6em}to{opacity:1}}
@keyframes rlcRun{from{transform:translateX(-110%)}to{transform:translateX(310%)}}
@media (max-width:640px){
  .rlc-circ{left:-120px;top:-150px;width:900px;height:892px}
  .rlc-main{gap:34px;padding:20px}
  .rlc-mark{width:150px;height:149px}
  .rlc-mark .rlc-mrunbox{left:-6px;top:-6px;width:162px;height:160.7px}
  .rlc-wmk-nome{font-size:42px}
  .rlc-sub{font-size:14px}
  .rlc-prog{width:260px}
  .rlc-foot{bottom:20px;font-size:11px}
}
@media (prefers-reduced-motion:reduce){
  .rlc-root *{animation:none!important}
  .rlc-mdraw path,.rlc-ol{stroke-dashoffset:0}
  .rlc-pl,.rlc-mrun{opacity:0}
  .rlc-runner{transform:none}
}
`
}
