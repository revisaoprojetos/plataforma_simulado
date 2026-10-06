'use client'

/**
 * Loading FALLBACK da marca Revisão — slug `rev-loading-classico` (spec 02 §1.2/§3.1).
 * Porte FIEL do mockup `design/LoadingRevisao.dc.html` (claro) e
 * `LoadingRevisaoEscuro.dc.html` (escuro), com overrides do board mobile
 * `LoadingRevisaoMobile.dc.html` (breakpoint ≤640px).
 *
 * Sequência: grade (fade+pan 40s) · marca d'água (sway 12s) · logo draw .3s →
 * rfill 1.3s · ecos · wordmark "REVISÃO" letra a letra · "ENSINO JURÍDICO" ·
 * barra com runner (loop). "Pronto" ~3.1s.
 *
 * Keyframes com prefixo `rl-`/classes `.rl-*` para não colidir com os outros
 * loadings. `prefers-reduced-motion`: anima nada e mostra o estado final.
 */

import { MarcaRevisao, REVISAO_R_PATH, REVISAO_R_OUTLINE } from '../brand-marks'
import { RevisaoParticulas } from './revisao-particulas'

export type RevisaoTheme = 'claro' | 'escuro'

// Fundo e cor do rodapé por tema (spec 02 §5.2 / mockups).
const BG: Record<RevisaoTheme, string> = {
  claro: 'linear-gradient(155deg,#2E1F7A 0%,#4A31B8 50%,#7356E6 100%)',
  escuro: 'linear-gradient(155deg,#0B0720 0%,#140C38 50%,#1F1352 100%)',
}
const FOOT: Record<RevisaoTheme, string> = { claro: '#D4C9FA', escuro: '#8E82BF' }
const LINES_ALPHA: Record<RevisaoTheme, string> = { claro: '.07', escuro: '.05' }
const BAND: Record<RevisaoTheme, string> = {
  claro: 'linear-gradient(180deg,rgba(30,18,80,0),rgba(30,18,80,.35))',
  escuro: 'linear-gradient(180deg,rgba(5,3,18,0),rgba(5,3,18,.55))',
}

const LETRAS = ['R', 'E', 'V', 'I', 'S', 'Ã', 'O']

export function LoadingRevisaoClassico({
  theme = 'claro',
  message,
  efeitos = false,
  quadrados = false,
}: {
  theme?: RevisaoTheme
  message?: string
  /** `rev-loading-formas` → efeitos (brilhos + formas flutuantes). */
  efeitos?: boolean
  /** `rev-loading-quadrados` → só brilhos de pixel. */
  quadrados?: boolean
}) {
  const footColor = FOOT[theme]
  return (
    <div className="rl-root">
      <style>{css(theme)}</style>
      <div className="rl-lines" aria-hidden="true" />
      <RevisaoParticulas efeitos={efeitos} quadrados={quadrados} />

      {/* contorno (traço) do logo à esquerda */}
      <svg
        className="rl-trace"
        viewBox="0 0 68 66"
        aria-hidden="true"
      >
        <path fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="0.25" d={REVISAO_R_PATH} />
        <path className="rl-trace-run" fill="none" stroke="#F1C232" strokeWidth="0.5" strokeLinecap="round" d={REVISAO_R_OUTLINE} />
      </svg>

      {/* marca d'água grande à direita */}
      <svg className="rl-wm" viewBox="0 0 68 66" aria-hidden="true">
        <path fillRule="evenodd" fill="rgba(255,255,255,.04)" d={REVISAO_R_PATH} />
      </svg>

      <div className="rl-band" aria-hidden="true" />

      <main role="status" aria-live="polite" className="rl-main">
        <div className="rl-lockup">
          <div className="rl-logo">
            <svg className="rl-echo rl-e1" viewBox="0 0 68 66" aria-hidden="true"><path fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="0.35" d={REVISAO_R_OUTLINE} /></svg>
            <svg className="rl-echo rl-e2" viewBox="0 0 68 66" aria-hidden="true"><path fill="none" stroke="rgba(255,196,163,.55)" strokeWidth="0.35" d={REVISAO_R_OUTLINE} /></svg>
            <svg className="rl-echo rl-e3" viewBox="0 0 68 66" aria-hidden="true"><path fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="0.35" d={REVISAO_R_OUTLINE} /></svg>
            <MarcaRevisao className="rl-rfill" fill="#FFFFFF" />
            <svg className="rl-rdraw" viewBox="0 0 68 66" aria-hidden="true"><path pathLength={1} fill="none" stroke="#FFFFFF" strokeWidth="0.6" strokeLinejoin="round" d={REVISAO_R_PATH} /></svg>
          </div>

          <div className="rl-wordwrap">
            <div className="rl-word" aria-label="Revisão">
              {LETRAS.map((l, i) => (
                <span key={i} className={`rl-wl rl-w${i + 1}`}>{l}</span>
              ))}
            </div>
            <div className="rl-sub">ENSINO JURÍDICO</div>
          </div>
        </div>

        <div className="rl-load" role="img" aria-label="Carregando">
          <span className="rl-runner" />
        </div>

        {message ? <p className="rl-msg" style={{ color: footColor }}>{message}</p> : null}
      </main>

      <div className="rl-foot" style={{ color: footColor }}>© 2026 Revisão Ensino Jurídico</div>
    </div>
  )
}

function css(theme: RevisaoTheme) {
  const a = LINES_ALPHA[theme]
  return `
.rl-root{position:relative;overflow:hidden;min-height:100vh;width:100%;background:${BG[theme]};font-family:'Plus Jakarta Sans',sans-serif;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
.rl-lines{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,${a}) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,${a}) 1px,transparent 1px);background-size:64px 64px;-webkit-mask-image:radial-gradient(ellipse 70% 70% at 50% 48%,#000 25%,transparent 85%);mask-image:radial-gradient(ellipse 70% 70% at 50% 48%,#000 25%,transparent 85%);animation:rlFade 1.4s ease-out both,rlGridPan 40s linear 1.4s infinite}
.rl-trace{position:absolute;width:320px;height:311px;left:5%;top:300px;pointer-events:none}
.rl-trace path:first-child{stroke-dasharray:420;stroke-dashoffset:420;animation:rlDraw 2.6s cubic-bezier(.6,.1,.2,1) .6s forwards}
.rl-trace-run{stroke-dasharray:22 400;stroke-dashoffset:0;opacity:0;animation:rlFade .6s ease-out 3.2s forwards,rlTrun 7s linear 3.2s infinite}
.rl-wm{position:absolute;width:560px;height:544px;right:4%;top:120px;pointer-events:none;animation:rlFade 1.6s ease-out .4s both,rlSway 12s ease-in-out 2s infinite alternate}
.rl-band{position:absolute;left:0;right:0;bottom:0;height:240px;pointer-events:none;background:${BAND[theme]}}
.rl-main{position:relative;display:flex;flex-direction:column;align-items:center;gap:64px;padding:24px}
.rl-lockup{display:flex;align-items:flex-start}
.rl-logo{position:relative;width:220px;height:213px}
.rl-echo{position:absolute;inset:0;width:100%;height:100%;overflow:visible;transform-origin:50% 55%;opacity:0;animation:rlEcho 3.6s cubic-bezier(.2,.6,.3,1) infinite}
.rl-e1{animation-delay:2.3s}.rl-e2{animation-delay:3.5s}.rl-e3{animation-delay:4.7s}
.rl-rfill{position:absolute;inset:0;width:100%;height:100%;transform-origin:50% 90%;animation:rlRfill .9s cubic-bezier(.2,.8,.2,1.2) 1.3s both}
.rl-rdraw{position:absolute;inset:0;width:100%;height:100%}
.rl-rdraw path{stroke-dasharray:1;stroke-dashoffset:1;animation:rlDraw 1.4s cubic-bezier(.6,.1,.2,1) .3s forwards}
.rl-wordwrap{position:relative;display:flex;flex-direction:column;margin-left:-14px;margin-top:46px;font-family:'Montserrat',sans-serif;animation:rlSlide .8s cubic-bezier(.2,.8,.2,1) 1.6s both}
.rl-word{font-weight:800;font-size:100px;line-height:.74;letter-spacing:.01em;padding-top:.12em;white-space:nowrap}
.rl-wl{display:inline-block;animation:rlWl .6s cubic-bezier(.2,.8,.2,1) both}
.rl-w1{animation-delay:1.75s}.rl-w2{animation-delay:1.82s}.rl-w3{animation-delay:1.89s}.rl-w4{animation-delay:1.96s}.rl-w5{animation-delay:2.03s}.rl-w6{animation-delay:2.1s}.rl-w7{animation-delay:2.17s}
.rl-sub{margin-left:6px;margin-top:25px;font-weight:500;font-size:34px;line-height:.74;letter-spacing:.22em;white-space:nowrap;animation:rlSubIn .9s cubic-bezier(.2,.8,.2,1) 2.4s both}
.rl-load{position:relative;width:440px;height:5px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.16);animation:rlUp .8s cubic-bezier(.2,.8,.2,1) 2.8s both}
.rl-runner{position:absolute;top:0;left:0;height:100%;width:34%;border-radius:999px;background:linear-gradient(90deg,rgba(255,255,255,0),#FFFFFF 55%,#F1C232);transform:translateX(-110%);animation:rlRun 1.5s cubic-bezier(.65,0,.35,1) 3.1s infinite}
.rl-msg{margin:0;font-size:13px;font-weight:500;animation:rlFade .4s ease-out 3.1s both}
.rl-foot{position:absolute;bottom:26px;font-size:12px;animation:rlFade 1s ease-out .4s both}
@keyframes rlFade{from{opacity:0}to{opacity:1}}
@keyframes rlGridPan{from{background-position:0 0}to{background-position:64px 128px}}
@keyframes rlSway{to{transform:translateY(-22px) rotate(-3deg)}}
@keyframes rlDraw{to{stroke-dashoffset:0}}
@keyframes rlTrun{to{stroke-dashoffset:-422}}
@keyframes rlRfill{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:none}}
@keyframes rlEcho{0%{opacity:0;transform:scale(.8)}15%{opacity:.6}100%{opacity:0;transform:scale(1.45)}}
@keyframes rlSlide{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}}
@keyframes rlWl{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
@keyframes rlSubIn{from{opacity:0;letter-spacing:.5em}to{opacity:1;letter-spacing:.22em}}
@keyframes rlUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes rlRun{from{transform:translateX(-110%)}to{transform:translateX(310%)}}
@media (max-width:640px){
  .rl-lines{background-size:40px 40px;-webkit-mask-image:radial-gradient(ellipse 90% 60% at 50% 48%,#000 25%,transparent 85%);mask-image:radial-gradient(ellipse 90% 60% at 50% 48%,#000 25%,transparent 85%)}
  .rl-trace{width:150px;height:146px;left:-46px;top:auto;bottom:96px}
  .rl-wm{width:280px;height:272px;right:-96px;top:70px}
  .rl-band{height:180px}
  .rl-main{gap:48px;padding:20px}
  .rl-logo{width:106px;height:103px}
  .rl-wordwrap{margin-left:-7px;margin-top:22px}
  .rl-word{font-size:48px}
  .rl-sub{margin-left:3px;margin-top:12px;font-size:16.4px}
  .rl-load{width:270px}
  .rl-foot{bottom:20px;font-size:11px}
}
@media (prefers-reduced-motion:reduce){
  .rl-root *{animation:none!important}
  .rl-rdraw path{stroke-dashoffset:0}
  .rl-echo{opacity:0}
  .rl-trace-run{opacity:0}
  .rl-runner{transform:none}
}
`
}
