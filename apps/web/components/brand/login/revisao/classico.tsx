'use client'

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN Revisão — LAYOUT "clássico" (card central + headline no topo).
// Efeitos: nenhum (rev-login-classico) · quadrados (rev-login-quadrados) ·
// formas (rev-login-formas). Porte fiel de LoginRevisao3 / LoginRevisaoEscuro /
// LoginRevisaoMobile. Prefixo scoped `rlc-`. (spec 02 §2.3)
// ─────────────────────────────────────────────────────────────────────────────

import { LoginForm } from '../login-form'
import type { LoginVariantProps } from '../types'
import {
  BG, FOOT, LINES_A, BAND, TOKENS, CARD_BG, CARD_BORDER,
  Quadrados, Formas, HeaderRevisao, MarcaRevisao, REVISAO_R_PATH, REVISAO_R_OUTLINE,
  type RevTheme, type Efeito,
} from './shared'

const MASK = 'radial-gradient(ellipse 75% 75% at 50% 45%,#000 30%,transparent 90%)'

export function LoginRevisaoClassico({
  theme, core, preview, plataforma, efeito,
}: LoginVariantProps & { efeito: Efeito }) {
  const t: RevTheme = theme === 'escuro' ? 'escuro' : 'claro'
  const quad = efeito === 'quadrados' || efeito === 'formas'
  const formas = efeito === 'formas'

  return (
    <div className="rlc-root" style={{ background: BG[t] }}>
      <style>{css(t)}</style>

      <div className="rlc-lines" aria-hidden="true" />
      {quad && <Quadrados prefixo="rlc" mask={MASK} />}

      {/* marca d'água grande à direita */}
      <svg className="rlc-wm" viewBox="0 0 68 66" aria-hidden="true">
        <path fillRule="evenodd" fill="rgba(255,255,255,.05)" d={REVISAO_R_PATH} />
      </svg>
      {/* contorno traçado à esquerda */}
      <svg className="rlc-trace" viewBox="0 0 68 66" aria-hidden="true">
        <path fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="0.25" d={REVISAO_R_PATH} />
        <path className="rlc-run" fill="none" stroke="#FFC4A3" strokeWidth="0.5" strokeLinecap="round" d={REVISAO_R_OUTLINE} />
      </svg>

      {formas && <Formas prefixo="rlc" />}

      <div className="rlc-band" aria-hidden="true" />

      <HeaderRevisao prefixo="rlc" />

      <main className="rlc-main">
        <div className="rlc-headline">
          <h1 className="rlc-up rlc-d2">Sua aprovação começa<br />no <span className="rlc-hl">Revisão</span>.</h1>
          <p className="rlc-up rlc-d3">Entre com o seu e-mail e continue de onde parou.</p>
        </div>

        <div className="rlc-cardwrap rlc-pop">
          <div className="rlc-card" style={{ background: CARD_BG[t], border: CARD_BORDER[t] }}>
            <div className="rlc-logo-in">
              <MarcaRevisao width={60} height={58} fill={t === 'escuro' ? '#FFFFFF' : '#4F4A6A'} />
            </div>
            <LoginForm
              brand="revisao" theme={theme} core={core} tokens={TOKENS[t]} preview={preview}
              centro mostrarTitulo tituloAluno="Login de Acesso" tituloAdmin="Login de Acesso" ctaLabel="Entrar"
            />
          </div>
        </div>

        <div className="rlc-chips rlc-up rlc-d7">
          {['Correção automática', 'Desempenho por matéria', 'Acesso só com e-mail'].map((c) => (
            <span key={c} className="rlc-chip">
              <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="#FFB993" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              {c}
            </span>
          ))}
        </div>
      </main>

      <footer className="rlc-foot rlc-up rlc-d7" style={{ color: FOOT[t] }}>© 2026 {plataforma}</footer>
    </div>
  )
}

function css(t: RevTheme) {
  const a = LINES_A[t]
  return `
.rlc-root{position:relative;overflow:hidden;min-height:100vh;width:100%;background-attachment:fixed;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#fff;display:flex;flex-direction:column}
.rlc-lines{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,${a}) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,${a}) 1px,transparent 1px);background-size:64px 64px;-webkit-mask-image:${MASK};mask-image:${MASK};animation:rlcFade 1.4s ease-out both,rlcGridPan 40s linear 1.4s infinite}
.rlc-wm{position:absolute;width:560px;height:544px;right:5%;top:110px;pointer-events:none;animation:rlcWmIn 1.4s cubic-bezier(.2,.8,.2,1) .3s both,rlcSway 12s ease-in-out 1.7s infinite alternate}
.rlc-trace{position:absolute;width:320px;height:311px;left:5%;top:300px;pointer-events:none}
.rlc-trace path:first-child{stroke-dasharray:420;stroke-dashoffset:420;animation:rlcDraw 2.6s cubic-bezier(.6,.1,.2,1) .6s forwards}
.rlc-run{stroke-dasharray:22 400;stroke-dashoffset:0;opacity:0;animation:rlcFade .6s ease-out 3.2s forwards,rlcRun 7s linear 3.2s infinite}
.rlc-band{position:absolute;left:0;right:0;bottom:0;height:220px;pointer-events:none;background:${BAND[t]}}
.rlc-pxw{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.rlc-pxm{position:absolute;inset:0;animation:rlcPxPan 40s linear 1.4s infinite}
.rlc-px{position:absolute;opacity:0;animation:rlcPx 7s ease-in-out infinite}
.rlc-sh{position:absolute;bottom:-40px;box-sizing:border-box;pointer-events:none;animation-name:rlcRise;animation-timing-function:linear;animation-iteration-count:infinite}
.rlc-plus{width:16px;height:16px;background:linear-gradient(rgba(255,255,255,.4),rgba(255,255,255,.4)) center/100% 1.5px no-repeat,linear-gradient(rgba(255,255,255,.4),rgba(255,255,255,.4)) center/1.5px 100% no-repeat}

.rlc-head{position:relative;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:30px 44px 0}
.rlc-brand{display:flex;align-items:center;gap:12px}
.rlc-brandtxt{display:flex;flex-direction:column;line-height:1.2}
.rlc-brandname{font-weight:800;font-size:16px;letter-spacing:-.02em}
.rlc-brandsub{font-size:10.5px;font-weight:700;letter-spacing:.18em;color:#D9CFFF}
.rlc-ghost{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.28);color:#fff;font-size:13px;font-weight:600;text-decoration:none;transition:background .15s}
.rlc-ghost:hover{background:rgba(255,255,255,.14)}

.rlc-main{position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;padding:24px 24px 96px;box-sizing:border-box;text-align:center}
.rlc-headline{display:flex;flex-direction:column;align-items:center;gap:14px;max-width:720px}
.rlc-headline h1{margin:0;font-weight:800;font-size:54px;line-height:1.06;letter-spacing:-.045em;color:#fff;text-shadow:0 2px 24px rgba(10,5,35,.45)}
.rlc-hl{color:#fff}
.rlc-headline p{margin:0;font-size:17px;line-height:1.6;color:#E1D9FF}
.rlc-cardwrap{position:relative;width:100%;max-width:420px}
.rlc-card{position:relative;color:${t === 'escuro' ? '#fff' : '#1D1933'};border-radius:28px;padding:34px 32px 28px;box-sizing:border-box;box-shadow:0 2px 4px rgba(20,10,60,.08),0 40px 80px -28px rgba(10,5,35,.7);display:flex;flex-direction:column;gap:14px;text-align:left}
.rlc-logo-in{display:flex;justify-content:center;animation:rlcLogo .9s cubic-bezier(.2,.8,.2,1) .95s both}
.rlc-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 26px;font-size:13px;font-weight:600;color:#E6DEFF}
.rlc-chip{display:inline-flex;align-items:center;gap:8px}
.rlc-foot{position:absolute;left:44px;bottom:26px;font-size:12px}

.rlc-up{animation:rlcUp .9s cubic-bezier(.2,.8,.2,1) both}
.rlc-pop{animation:rlcPop 1s cubic-bezier(.2,.8,.2,1) .7s both}
.rlc-d2{animation-delay:.4s}.rlc-d3{animation-delay:.55s}.rlc-d7{animation-delay:1.35s}

@keyframes rlcFade{from{opacity:0}to{opacity:1}}
@keyframes rlcGridPan{from{background-position:0 0}to{background-position:64px 128px}}
@keyframes rlcPxPan{to{transform:translate(64px,128px)}}
@keyframes rlcPx{0%,100%{opacity:0}12%,30%{opacity:1}44%{opacity:0}}
@keyframes rlcRise{0%{transform:translateY(0) rotate(0);opacity:0}10%{opacity:1}85%{opacity:1}100%{transform:translateY(-1100px) rotate(240deg);opacity:0}}
@keyframes rlcWmIn{from{opacity:0;transform:translateX(60px) rotate(6deg)}to{opacity:1;transform:none}}
@keyframes rlcSway{to{transform:translateY(-24px) rotate(-3deg)}}
@keyframes rlcDraw{to{stroke-dashoffset:0}}
@keyframes rlcRun{to{stroke-dashoffset:-422}}
@keyframes rlcUp{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
@keyframes rlcPop{from{opacity:0;transform:translateY(40px) scale(.96)}to{opacity:1;transform:none}}
@keyframes rlcLogo{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:none}}

@media (max-width:640px){
  .rlc-root{background-attachment:scroll}
  .rlc-lines{background-size:40px 40px;-webkit-mask-image:radial-gradient(ellipse 95% 75% at 50% 40%,#000 30%,transparent 92%);mask-image:radial-gradient(ellipse 95% 75% at 50% 40%,#000 30%,transparent 92%);animation:rlcFade 1.4s ease-out both,rlcGridPanM 40s linear 1.4s infinite}
  .rlc-wm{width:280px;height:272px;right:-96px;top:64px}
  .rlc-trace{width:150px;height:146px;left:-46px;top:auto;bottom:96px}
  .rlc-band{height:180px}
  .rlc-head{padding:18px 20px 0}
  .rlc-ghost{height:44px;width:44px;padding:0;justify-content:center;border-radius:50%}
  .rlc-ghosttxt{display:none}
  .rlc-main{gap:26px;padding:20px 20px 24px;justify-content:center}
  .rlc-headline{gap:10px;padding:0 6px}
  .rlc-headline h1{font-size:31px;line-height:1.12;letter-spacing:-.04em}
  .rlc-headline p{font-size:15px;line-height:1.5}
  .rlc-card{border-radius:26px;padding:28px 22px 24px}
  .rlc-chips{display:none}
  .rlc-foot{position:static;left:auto;bottom:auto;padding:0 20px 18px;text-align:center}
  @keyframes rlcGridPanM{from{background-position:0 0}to{background-position:40px 80px}}
}
@media (prefers-reduced-motion:reduce){
  .rlc-root *{animation:none!important}
  .rlc-trace path:first-child{stroke-dashoffset:0}
  .rlc-run{opacity:0}
  .rlc-px,.rlc-sh{opacity:0}
}
`
}
