'use client'

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN Revisão — LAYOUT "lista" (2 colunas: lockup+headline+lista 01/02/03 à
// esquerda, card à direita). Efeitos: nenhum (rev-login-lista) · efeitos
// (rev-login-lista-efeitos: quadrados+formas+órbita+brilho CTA+headline palavra a
// palavra+destaque das linhas) · quadrados (rev-login-lista-quadrados: quadrados
// com pan). Porte de LoginRevisao4 / ...4Efeito / ...Quad4. Prefixo `rll-`.
// ─────────────────────────────────────────────────────────────────────────────

import { LoginForm } from '../login-form'
import type { LoginVariantProps } from '../types'
import {
  BG, FOOT, LINES_A, TOKENS, CARD_BG, CARD_BORDER,
  Quadrados, Formas, MarcaRevisao, REVISAO_R_PATH, REVISAO_R_OUTLINE,
  type RevTheme, type Efeito,
} from './shared'

const ITENS = ['Correção automática', 'Desempenho por matéria', 'Acesso só com e-mail']
const H1_MASK = 'radial-gradient(ellipse 80% 75% at 30% 45%,#000 30%,transparent 90%)'
// Eyebrow do card: roxo (aluno) / pêssego-queimado (admin) por tema (§2.3).
const EYEBROW_ALUNO: Record<RevTheme, string> = { claro: '#5B3FD0', escuro: '#B9A8FF' }
const EYEBROW_ADMIN: Record<RevTheme, string> = { claro: '#B5653A', escuro: '#FFB993' }

export function LoginRevisaoLista({
  theme, core, preview, plataforma, efeito,
}: LoginVariantProps & { efeito: Efeito }) {
  const t: RevTheme = theme === 'escuro' ? 'escuro' : 'claro'
  const ef = efeito === 'efeitos'
  const quad = efeito === 'quadrados'

  return (
    <div className="rll-root" style={{ background: BG[t] }}>
      <style>{css(t, ef)}</style>

      <div className="rll-lines" aria-hidden="true" />
      {ef && <Quadrados prefixo="rll" mask={H1_MASK} />}
      {quad && <Quadrados prefixo="rll" pan mask={H1_MASK} />}
      {ef && <Formas prefixo="rll" />}

      {/* contorno gigante do R à direita */}
      <svg className="rll-trace" viewBox="0 0 68 66" aria-hidden="true">
        <path fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="0.12" d={REVISAO_R_PATH} />
        <path className="rll-run" fill="none" stroke="#FFC4A3" strokeWidth="0.25" strokeLinecap="round" d={REVISAO_R_OUTLINE} />
      </svg>
      <div className="rll-band" aria-hidden="true" />

      <main className="rll-main">
        <section className="rll-left">
          {/* lockup REVISÃO */}
          <div className="rll-up rll-d1">
            <div className="rll-lock" role="img" aria-label="Revisão Ensino Jurídico">
              <svg className="rll-rmark" viewBox="0 0 68 66" aria-hidden="true">
                <path className="rll-rfill" fillRule="evenodd" fill="#FFFFFF" d={REVISAO_R_PATH} />
                <path className="rll-rdraw" pathLength={1} fill="none" stroke="#FFFFFF" strokeWidth="0.7" d={REVISAO_R_PATH} />
              </svg>
              <div className="rll-wm">
                <span className="rll-word">REVISÃO</span>
                <span className="rll-sub">ENSINO JURÍDICO</span>
              </div>
            </div>
          </div>

          {/* headline */}
          <div className="rll-h1block">
            {ef ? (
              <h1 className="rll-h1">
                <span className="rll-w"><span style={{ animationDelay: '.45s' }}>Sua</span></span>{' '}
                <span className="rll-w"><span style={{ animationDelay: '.54s' }}>aprovação</span></span><br />
                <span className="rll-w"><span style={{ animationDelay: '.63s' }}>começa</span></span>{' '}
                <span className="rll-w"><span style={{ animationDelay: '.72s' }}><Hl /></span></span>
              </h1>
            ) : (
              <h1 className="rll-h1 rll-up rll-d2">Sua aprovação<br />começa <Hl /></h1>
            )}
            <p className="rll-sub2 rll-up rll-d3">Entre com o seu e-mail e continue de onde parou.</p>
          </div>

          {/* lista 01/02/03 */}
          <div className="rll-list">
            {ITENS.map((it, i) => (
              <div key={it} className={`rll-row rll-up rll-f${i + 1}${ef ? ` rll-rw rll-r${i + 1}` : ''}`}>
                <span className="rll-num">{String(i + 1).padStart(2, '0')}</span>
                {it}
                <span className={`rll-ck${ef ? ' rll-ckon' : ''}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* card */}
        <div className="rll-cardwrap rll-pop">
          <div className="rll-tab" aria-hidden="true" />
          <div className="rll-card" style={{ background: CARD_BG[t], border: CARD_BORDER[t] }}>
            {ef && (
              <svg className="rll-orbit" aria-hidden="true">
                <rect x="0" y="0" width="100%" height="100%" rx="28" pathLength={100} fill="none" stroke="#FFC4A3" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            <div className="rll-cardhead">
              <div className="rll-cardtitle">
                <span className="rll-eyebrow" style={{ color: core.modo === 'admin' ? EYEBROW_ADMIN[t] : EYEBROW_ALUNO[t] }}>
                  {core.modo === 'admin' ? 'ÁREA ADMINISTRATIVA' : 'ÁREA DO ESTUDANTE'}
                </span>
                <h2 className="rll-cardh2">Login de Acesso</h2>
              </div>
              <div className="rll-cardlogo rll-logo-in">
                <MarcaRevisao width={46} height={45} fill={t === 'escuro' ? '#FFFFFF' : '#4F4A6A'} />
              </div>
            </div>
            <LoginForm
              brand="revisao" theme={theme} core={core} tokens={TOKENS[t]} preview={preview}
              mostrarTitulo={false} ctaLabel="Entrar"
            />
          </div>
        </div>
      </main>

      <footer className="rll-foot rll-up rll-d7" style={{ color: FOOT[t] }}>© 2026 {plataforma}</footer>
    </div>
  )
}

function Hl() {
  return (
    <span className="rll-hl">
      no <span className="rll-hlword">Revisão</span>.
      <svg className="rll-uline" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
        <path pathLength={1} d="M2 8C60 2 140 2 198 6" fill="none" stroke="#FFC4A3" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function css(t: RevTheme, ef: boolean) {
  const a = LINES_A[t]
  return `
.rll-root{position:relative;overflow:hidden;min-height:100vh;width:100%;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#fff;display:flex;flex-direction:column}
.rll-lines{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,${a}) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,${a}) 1px,transparent 1px);background-size:64px 64px;-webkit-mask-image:${H1_MASK};mask-image:${H1_MASK};animation:rllFade 1.4s ease-out both${ef ? '' : ',rllGridPan 40s linear 1.4s infinite'}}
.rll-trace{position:absolute;width:900px;height:874px;right:-120px;top:40px;pointer-events:none}
.rll-trace path:first-child{stroke-dasharray:420;stroke-dashoffset:420;animation:rllDraw 2.6s cubic-bezier(.6,.1,.2,1) .4s forwards}
.rll-run{stroke-dasharray:22 400;stroke-dashoffset:0;opacity:0;animation:rllFade .6s ease-out 3s forwards,rllRun 8s linear 3s infinite}
.rll-band{position:absolute;left:0;right:0;bottom:0;height:220px;pointer-events:none;background:linear-gradient(180deg,rgba(5,3,18,0),rgba(5,3,18,.3))}
.rll-pxw{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.rll-pxm{position:absolute;inset:0}
.rll-pan{animation:rllPxPan 40s linear 1.4s infinite}
.rll-px{position:absolute;opacity:0;animation:rllPx 7s ease-in-out infinite}
.rll-sh{position:absolute;bottom:-40px;box-sizing:border-box;pointer-events:none;animation-name:rllRise;animation-timing-function:linear;animation-iteration-count:infinite}
.rll-plus{width:16px;height:16px;background:linear-gradient(rgba(255,255,255,.4),rgba(255,255,255,.4)) center/100% 1.5px no-repeat,linear-gradient(rgba(255,255,255,.4),rgba(255,255,255,.4)) center/1.5px 100% no-repeat}

.rll-main{position:relative;flex:1;display:flex;align-items:center;justify-content:space-between;gap:64px;padding:56px 120px 96px;box-sizing:border-box}
.rll-left{flex:1;max-width:560px;display:flex;flex-direction:column;gap:30px}
.rll-lock{display:flex;align-items:flex-start;gap:0}
.rll-rmark{width:107px;height:104px;flex-shrink:0}
.rll-rfill{animation:rllFill .7s ease-out 1.2s both}
.rll-rdraw{stroke-dasharray:1;stroke-dashoffset:1;animation:rllDraw2 1.2s cubic-bezier(.6,.1,.2,1) .3s forwards}
.rll-wm{display:flex;flex-direction:column;margin-left:-6px;margin-top:21px;font-family:'Montserrat',sans-serif;animation:rllSlide .8s cubic-bezier(.2,.8,.2,1) 1.3s both}
.rll-word{font-weight:800;font-size:48px;line-height:.74;letter-spacing:.01em;padding-top:.12em;white-space:nowrap}
.rll-sub{margin-top:11px;margin-left:2px;font-weight:500;font-size:16px;line-height:.74;letter-spacing:.22em;white-space:nowrap;color:#E1D9FF}
.rll-h1block{display:flex;flex-direction:column;gap:16px}
.rll-h1{margin:0;font-weight:800;font-size:56px;line-height:1.06;letter-spacing:-.045em;color:#fff;text-shadow:0 2px 24px rgba(10,5,35,.45)}
.rll-hlword{color:#fff}
.rll-sub2{margin:0;font-size:18px;line-height:1.6;color:#E1D9FF;max-width:460px}
.rll-hl{position:relative;white-space:nowrap}
.rll-uline{position:absolute;left:0;bottom:-8px;width:100%;height:12px}
.rll-uline path{stroke-dasharray:1;stroke-dashoffset:1;animation:rllDraw2 .9s cubic-bezier(.6,.1,.2,1) 1.4s forwards${ef ? ',rllReline 8s cubic-bezier(.6,.1,.2,1) 6s infinite' : ''}}
.rll-w{display:inline-block;overflow:hidden;vertical-align:top;padding:0 .04em .22em 0;margin-bottom:-.22em}
.rll-w>span{display:inline-block;transform:translateY(110%);animation:rllWup .8s cubic-bezier(.2,.8,.2,1) forwards}
.rll-list{display:flex;flex-direction:column;width:100%;max-width:440px;border-top:1px solid rgba(255,255,255,.16)}
.rll-row{position:relative;isolation:isolate;display:flex;align-items:center;gap:14px;padding:14px 2px;border-bottom:1px solid rgba(255,255,255,.16);font-size:15px;font-weight:600;color:#fff}
.rll-num{font-family:Montserrat,sans-serif;font-weight:800;font-size:13px;color:#FFC4A3;width:26px}
.rll-ck{margin-left:auto;width:26px;height:26px;border-radius:50%;background:rgba(255,196,163,.16);color:#FFC4A3;display:flex;align-items:center;justify-content:center}
.rll-rw::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,rgba(255,196,163,.16),rgba(255,196,163,0));transform-origin:0 50%;transform:scaleX(0);animation:rllRowOn 6s cubic-bezier(.6,.1,.2,1) infinite}
.rll-r1::before{animation-delay:2.4s}.rll-r2::before{animation-delay:4.4s}.rll-r3::before{animation-delay:6.4s}
.rll-ckon{animation:rllCkOn 6s ease-in-out infinite}
.rll-r1 .rll-ckon{animation-delay:2.4s}.rll-r2 .rll-ckon{animation-delay:4.4s}.rll-r3 .rll-ckon{animation-delay:6.4s}

.rll-cardwrap{position:relative;width:100%;max-width:420px;flex-shrink:0}
.rll-tab{position:absolute;left:22px;right:22px;top:-8px;height:8px;border-radius:8px 8px 0 0;background:#FFC4A3;opacity:.9}
.rll-card{position:relative;color:${t === 'escuro' ? '#fff' : '#1D1933'};border-radius:28px;padding:32px 30px 28px;box-sizing:border-box;box-shadow:0 2px 4px rgba(20,10,60,.08),0 40px 80px -28px rgba(10,5,35,.7);display:flex;flex-direction:column;gap:14px;text-align:left}
.rll-orbit{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.rll-orbit rect{stroke-dasharray:0 100;opacity:0;animation:rllOrbitIn 1.6s cubic-bezier(.6,.1,.2,1) 1.6s forwards,rllOrbit 7s linear 3.2s infinite}
.rll-cardhead{display:flex;align-items:center;justify-content:space-between;gap:12px}
.rll-cardtitle{display:flex;flex-direction:column;gap:6px;color:${t === 'escuro' ? '#fff' : '#1D1933'}}
.rll-eyebrow{font-size:11px;font-weight:800;letter-spacing:.2em}
.rll-cardh2{margin:0;font-weight:800;font-size:28px;letter-spacing:-.035em;color:${t === 'escuro' ? '#fff' : '#1D1933'}}
.rll-cardlogo{display:flex;flex-shrink:0}
.rll-logo-in{animation:rllLogo .9s cubic-bezier(.2,.8,.2,1) 1.05s both}
.rll-foot{position:absolute;left:44px;bottom:26px;font-size:12px}

.rll-up{animation:rllUp .9s cubic-bezier(.2,.8,.2,1) both}
.rll-pop{animation:rllPop 1s cubic-bezier(.2,.8,.2,1) .8s both}
.rll-d1{animation-delay:.15s}.rll-d2{animation-delay:.5s}.rll-d3{animation-delay:.65s}.rll-d7{animation-delay:1.35s}
.rll-f1{animation-delay:1.5s}.rll-f2{animation-delay:1.62s}.rll-f3{animation-delay:1.74s}

@keyframes rllFade{from{opacity:0}to{opacity:1}}
@keyframes rllGridPan{from{background-position:0 0}to{background-position:64px 128px}}
@keyframes rllPxPan{to{transform:translate(64px,128px)}}
@keyframes rllPx{0%,100%{opacity:0}12%,30%{opacity:1}44%{opacity:0}}
@keyframes rllRise{0%{transform:translateY(0) rotate(0);opacity:0}10%{opacity:1}85%{opacity:1}100%{transform:translateY(-1100px) rotate(240deg);opacity:0}}
@keyframes rllDraw{to{stroke-dashoffset:0}}
@keyframes rllDraw2{to{stroke-dashoffset:0}}
@keyframes rllRun{to{stroke-dashoffset:-422}}
@keyframes rllFill{from{opacity:0}to{opacity:1}}
@keyframes rllSlide{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:none}}
@keyframes rllUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes rllPop{from{opacity:0;transform:translateY(36px) scale(.97)}to{opacity:1;transform:none}}
@keyframes rllLogo{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:none}}
@keyframes rllWup{to{transform:none}}
@keyframes rllOrbitIn{0%{opacity:1;stroke-dasharray:0 100}100%{opacity:1;stroke-dasharray:12 88}}
@keyframes rllOrbit{from{stroke-dashoffset:0}to{stroke-dashoffset:-100}}
@keyframes rllRowOn{0%{transform:scaleX(0)}10%,30%{transform:scaleX(1)}40%,100%{transform:scaleX(1);opacity:0}}
@keyframes rllCkOn{0%,100%{background:rgba(255,196,163,.16);color:#FFC4A3;transform:none}8%,30%{background:#FFC4A3;color:#2E1F7A;transform:scale(1.12)}40%{background:rgba(255,196,163,.16);color:#FFC4A3;transform:none}}
@keyframes rllReline{0%{stroke-dashoffset:0}10%{stroke-dashoffset:-1}11%{stroke-dashoffset:1}22%,100%{stroke-dashoffset:0}}

@media (max-width:980px){
  .rll-main{flex-direction:column;align-items:stretch;gap:36px;padding:48px 32px 96px}
  .rll-left{max-width:none}
  .rll-cardwrap{max-width:460px;margin:0 auto;width:100%}
  .rll-h1{font-size:44px}
}
@media (max-width:640px){
  .rll-main{padding:32px 20px 24px;gap:26px}
  .rll-word{font-size:34px}.rll-sub{font-size:12px}.rll-rmark{width:78px;height:76px}
  .rll-h1{font-size:30px;line-height:1.12}
  .rll-sub2{font-size:15px}
  .rll-list{display:none}
  .rll-trace{width:420px;height:408px;right:-150px;top:auto;bottom:-40px}
  .rll-card{border-radius:26px;padding:28px 22px 24px}
  .rll-foot{position:static;left:auto;bottom:auto;padding:4px 20px 18px;text-align:center}
}
@media (prefers-reduced-motion:reduce){
  .rll-root *{animation:none!important}
  .rll-trace path:first-child,.rll-rdraw,.rll-uline path{stroke-dashoffset:0}
  .rll-run{opacity:0}.rll-px,.rll-sh,.rll-orbit rect{opacity:0}
  .rll-w>span{transform:none}.rll-rfill{opacity:1}
}
`
}
