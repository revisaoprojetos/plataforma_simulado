'use client'

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN Revisão — LAYOUT "código" (tema jurídico: CÓDIGO DO ESTUDANTE · TÍTULO I,
// "Art. 1º" em Fraunces itálico, §1º–§3º; card com 3 abas de índice na borda).
// Efeitos: nenhum (rev-login-codigo) · efeitos (rev-login-codigo-efeitos: quadrados
// +formas+Art.1º digitado+carimbo APROVADO+abas que espiam+§ Montserrat+brilho CTA
// +headline palavra a palavra) · quadrados (rev-login-codigo-quadrados: pan).
// Porte de LoginRevisao5 / ...5Efeito / ...Quad5. Prefixo `rlk-`.
// ─────────────────────────────────────────────────────────────────────────────

import { LoginForm } from '../login-form'
import type { LoginVariantProps } from '../types'
import {
  BG, FOOT, LINES_A, TOKENS, CARD_BG, CARD_BORDER,
  Quadrados, Formas, MarcaRevisao, REVISAO_R_PATH, REVISAO_R_OUTLINE,
  type RevTheme, type Efeito,
} from './shared'

const H1_MASK = 'radial-gradient(ellipse 80% 75% at 30% 45%,#000 30%,transparent 90%)'
const EYEBROW_ALUNO: Record<RevTheme, string> = { claro: '#5B3FD0', escuro: '#B9A8FF' }
const EYEBROW_ADMIN: Record<RevTheme, string> = { claro: '#B5653A', escuro: '#FFB993' }
const PARAGRAFOS = [
  { n: '§ 1º', pre: 'Toda questão tem ', mk: 'correção automática', pos: '.' },
  { n: '§ 2º', pre: 'Seu desempenho fica à vista, ', mk: 'matéria por matéria', pos: '.' },
  { n: '§ 3º', pre: 'Estudante entra ', mk: 'só com o e-mail', pos: ', sem senha.' },
]

export function LoginRevisaoCodigo({
  theme, core, preview, plataforma, efeito,
}: LoginVariantProps & { efeito: Efeito }) {
  const t: RevTheme = theme === 'escuro' ? 'escuro' : 'claro'
  const ef = efeito === 'efeitos'
  const quad = efeito === 'quadrados'

  return (
    <div className="rlk-root" style={{ background: BG[t] }}>
      <style>{css(t, ef)}</style>

      <div className="rlk-lines" aria-hidden="true" />
      {ef && <Quadrados prefixo="rlk" mask={H1_MASK} />}
      {quad && <Quadrados prefixo="rlk" pan mask={H1_MASK} />}
      {ef && <Formas prefixo="rlk" />}

      <svg className="rlk-trace" viewBox="0 0 68 66" aria-hidden="true">
        <path fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="0.12" d={REVISAO_R_PATH} />
        <path className="rlk-run" fill="none" stroke="#FFC4A3" strokeWidth="0.25" strokeLinecap="round" d={REVISAO_R_OUTLINE} />
      </svg>
      <div className="rlk-band" aria-hidden="true" />

      <main className="rlk-main">
        <section className="rlk-left">
          {/* lockup compacto */}
          <div className="rlk-lock rlk-up rlk-d1" role="img" aria-label="Revisão Ensino Jurídico">
            <MarcaRevisao width={47} height={46} fill="#FFFFFF" />
            <div className="rlk-locktxt">
              <span className="rlk-word">REVISÃO</span>
              <span className="rlk-sub">ENSINO JURÍDICO</span>
            </div>
          </div>

          <div className="rlk-body">
            {/* eyebrow CÓDIGO DO ESTUDANTE · TÍTULO I */}
            <div className="rlk-eyebrow rlk-up rlk-d2">
              <span>CÓDIGO DO ESTUDANTE</span>
              <span className="rlk-rule" />
              <span className="rlk-titulo">TÍTULO I</span>
            </div>

            {/* Art. 1º + carimbo (efeitos) */}
            <div className={`rlk-art rlk-up rlk-d2${ef ? ' rlk-art-ef' : ''}`}>
              <span className="rlk-ser rlk-artnum">{ef ? <span className="rlk-tw">Art. 1º</span> : 'Art. 1º'}</span>
              <span className="rlk-artline" />
              {ef && (
                <div className="rlk-stampwrap" aria-hidden="true">
                  <div className="rlk-stamp">
                    <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                      <defs><path id="rlk-sc0" d="M60 60m-45 0a45 45 0 1 1 90 0a45 45 0 1 1-90 0" /></defs>
                      <circle cx="60" cy="60" r="57" fill="none" stroke="#FFC4A3" strokeWidth="2.5" />
                      <circle cx="60" cy="60" r="36" fill="none" stroke="#FFC4A3" strokeWidth="1.5" />
                      <g className="rlk-ring"><text fill="#FFC4A3" fontFamily="Montserrat, sans-serif" fontWeight="800" fontSize="9" letterSpacing="1"><textPath textLength="276" lengthAdjust="spacing" href="#rlk-sc0">REVISÃO · ENSINO JURÍDICO · APROVAÇÃO · </textPath></text></g>
                      <text x="60" y="58" textAnchor="middle" fill="#FFC4A3" fontFamily="Montserrat, sans-serif" fontWeight="800" fontSize="8.6" letterSpacing=".4">APROVADO</text>
                      <path d="M52 65l5.5 5.5 11-11" fill="none" stroke="#FFC4A3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            {/* headline */}
            {ef ? (
              <h1 className="rlk-h1">
                <span className="rlk-w"><span style={{ animationDelay: '.70s' }}>Sua</span></span>{' '}
                <span className="rlk-w"><span style={{ animationDelay: '.79s' }}>aprovação</span></span><br />
                <span className="rlk-w"><span style={{ animationDelay: '.9s' }}>começa no <span className="rlk-hl">Revisão</span>.</span></span>
              </h1>
            ) : (
              <h1 className="rlk-h1 rlk-up rlk-d3">Sua aprovação<br />começa no <span className="rlk-hl">Revisão</span>.</h1>
            )}

            {/* §1º–§3º */}
            <div className="rlk-paras">
              {PARAGRAFOS.map((p, i) => (
                <p key={p.n} className={`rlk-para rlk-up rlk-q${i + 1}`}>
                  <span className="rlk-ser rlk-paranum">{p.n}</span>
                  <span>{p.pre}<mark className={`rlk-mk rlk-m${i + 1}`}>{p.mk}</mark>{p.pos}</span>
                </p>
              ))}
            </div>
          </div>
        </section>

        {/* card com abas */}
        <div className="rlk-cardwrap rlk-pop">
          <div className="rlk-tabs" aria-hidden="true">
            <span className={`rlk-tb rlk-t1${ef ? ' rlk-peek' : ''}`} style={{ background: '#FFC4A3' }} />
            <span className={`rlk-tb rlk-t2${ef ? ' rlk-peek' : ''}`} style={{ background: '#B9A8FF' }} />
            <span className={`rlk-tb rlk-t3${ef ? ' rlk-peek' : ''}`} style={{ background: '#E6DEFF' }} />
          </div>
          <div className="rlk-card" style={{ background: CARD_BG[t], border: CARD_BORDER[t] }}>
            {ef && (
              <svg className="rlk-orbit" aria-hidden="true">
                <rect x="0" y="0" width="100%" height="100%" rx="28" pathLength={100} fill="none" stroke="#FFC4A3" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            <div className="rlk-cardhead">
              <div className="rlk-cardtitle">
                <span className="rlk-cardeyebrow" style={{ color: core.modo === 'admin' ? EYEBROW_ADMIN[t] : EYEBROW_ALUNO[t] }}>
                  {core.modo === 'admin' ? 'ÁREA ADMINISTRATIVA' : 'ÁREA DO ESTUDANTE'}
                </span>
                <h2 className="rlk-cardh2">Login de Acesso</h2>
              </div>
              <div className="rlk-cardlogo rlk-logo-in">
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

      <footer className="rlk-foot rlk-up rlk-d7" style={{ color: FOOT[t] }}>© 2026 {plataforma}</footer>
    </div>
  )
}

function css(t: RevTheme, ef: boolean) {
  const a = LINES_A[t]
  // No efeito "efeitos" o § vira Montserrat 800; senão Fraunces itálico.
  const serRule = ef
    ? `.rlk-ser{font-family:'Montserrat',sans-serif;font-style:normal;font-weight:800;letter-spacing:-.01em}
.rlk-artnum.rlk-ser,.rlk-art-ef .rlk-ser{font-family:'Fraunces',Georgia,serif;font-style:italic;font-weight:600;letter-spacing:-.01em}`
    : `.rlk-ser{font-family:'Fraunces',Georgia,serif;font-style:italic;font-weight:600;letter-spacing:-.01em}`
  return `
.rlk-root{position:relative;overflow:hidden;min-height:100vh;width:100%;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#fff;display:flex;flex-direction:column}
.rlk-lines{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,${a}) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,${a}) 1px,transparent 1px);background-size:64px 64px;-webkit-mask-image:${H1_MASK};mask-image:${H1_MASK};animation:rlkFade 1.4s ease-out both${ef ? '' : ',rlkGridPan 40s linear 1.4s infinite'}}
.rlk-trace{position:absolute;width:900px;height:874px;right:-120px;top:40px;pointer-events:none}
.rlk-trace path:first-child{stroke-dasharray:420;stroke-dashoffset:420;animation:rlkDraw 2.6s cubic-bezier(.6,.1,.2,1) .4s forwards}
.rlk-run{stroke-dasharray:22 400;stroke-dashoffset:0;opacity:0;animation:rlkFade .6s ease-out 3s forwards,rlkRun 8s linear 3s infinite}
.rlk-band{position:absolute;left:0;right:0;bottom:0;height:220px;pointer-events:none;background:linear-gradient(180deg,rgba(5,3,18,0),rgba(5,3,18,.3))}
.rlk-pxw{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.rlk-pxm{position:absolute;inset:0}
.rlk-pan{animation:rlkPxPan 40s linear 1.4s infinite}
.rlk-px{position:absolute;opacity:0;animation:rlkPx 7s ease-in-out infinite}
.rlk-sh{position:absolute;bottom:-40px;box-sizing:border-box;pointer-events:none;animation-name:rlkRise;animation-timing-function:linear;animation-iteration-count:infinite}
.rlk-plus{width:16px;height:16px;background:linear-gradient(rgba(255,255,255,.4),rgba(255,255,255,.4)) center/100% 1.5px no-repeat,linear-gradient(rgba(255,255,255,.4),rgba(255,255,255,.4)) center/1.5px 100% no-repeat}

.rlk-main{position:relative;flex:1;display:flex;align-items:center;justify-content:space-between;gap:64px;padding:56px 120px 96px;box-sizing:border-box}
.rlk-left{flex:1;max-width:600px;display:flex;flex-direction:column;gap:34px}
.rlk-lock{display:flex;align-items:center;gap:10px}
.rlk-locktxt{display:flex;flex-direction:column;gap:4px;font-family:Montserrat,sans-serif}
.rlk-word{font-weight:800;font-size:19px;line-height:.8;letter-spacing:.01em}
.rlk-sub{font-weight:500;font-size:9px;letter-spacing:.22em;color:#E1D9FF}
.rlk-body{display:flex;flex-direction:column;gap:22px}
${serRule}
.rlk-eyebrow{display:flex;align-items:center;gap:12px;font-size:11px;font-weight:800;letter-spacing:.22em;color:#FFC4A3}
.rlk-rule{flex:1;max-width:120px;height:1px;background:rgba(255,196,163,.4)}
.rlk-titulo{color:#D4C9FA}
.rlk-art{display:flex;align-items:baseline;gap:16px;position:relative}
.rlk-art-ef{padding-right:132px}
.rlk-artnum{font-size:56px;color:#FFC4A3;line-height:1}
.rlk-artline{height:1px;flex:1;background:linear-gradient(90deg,rgba(255,196,163,.5),rgba(255,196,163,0))}
.rlk-tw{display:inline-block;overflow:hidden;white-space:nowrap;vertical-align:bottom;max-width:0;padding-right:.08em;border-right:.07em solid #FFC4A3;animation:rlkType .9s steps(8) .7s forwards,rlkCaret .9s step-end 1.6s infinite}
.rlk-stampwrap{position:absolute;right:0;top:50%;margin-top:-59px;width:118px;height:118px}
.rlk-stamp{width:100%;height:100%;opacity:0;animation:rlkSlam .55s cubic-bezier(.3,1.4,.5,1) 2.5s forwards}
.rlk-ring{transform-origin:60px 60px;animation:rlkSpin 24s linear 3.1s infinite}
.rlk-h1{margin:0;font-weight:800;font-size:54px;line-height:1.08;letter-spacing:-.045em;color:#fff;text-shadow:0 2px 24px rgba(10,5,35,.45)}
.rlk-hl{color:#fff}
.rlk-hlwrap{position:relative;display:inline-block;z-index:0}
.rlk-hlwrap::before{content:"";position:absolute;left:0;right:.25em;bottom:-.02em;height:.14em;border-radius:4px;background:#FFC4A3;z-index:-1;transform-origin:0 50%;transform:scaleX(0);animation:rlkMarker .9s cubic-bezier(.6,.1,.2,1) 1.4s forwards}
.rlk-w{display:inline-block;overflow:hidden;vertical-align:top;padding:0 .04em .22em 0;margin-bottom:-.22em}
.rlk-w>span{display:inline-block;transform:translateY(110%);animation:rlkWup .8s cubic-bezier(.2,.8,.2,1) forwards}
.rlk-paras{display:flex;flex-direction:column;gap:12px;border-left:2px solid rgba(255,196,163,.35);padding:2px 0 2px 18px}
.rlk-para{margin:0;display:flex;gap:14px;font-size:16px;line-height:1.55;color:#E6DEFF}
.rlk-paranum{flex-shrink:0;width:40px;color:#FFC4A3;font-size:17px}
.rlk-mk{background:none;color:#fff;font-weight:700;padding:0 1px 2px;background-image:linear-gradient(#FFC4A3,#FFC4A3);background-repeat:no-repeat;background-position:0 100%;background-size:0% 2px;animation:rlkMk 7.5s ease-in-out infinite}
.rlk-m1{animation-delay:2.2s}.rlk-m2{animation-delay:4.7s}.rlk-m3{animation-delay:7.2s}

.rlk-cardwrap{position:relative;width:100%;max-width:420px;flex-shrink:0}
.rlk-tabs{position:absolute;right:-26px;top:64px;display:flex;flex-direction:column;gap:8px;z-index:0}
.rlk-tb{display:block;width:26px;height:58px;border-radius:0 10px 10px 0;transform:translateX(-100%);transform-origin:0 50%;animation:rlkTabIn .7s cubic-bezier(.2,.8,.2,1) both}
.rlk-t1{animation-delay:1.5s}.rlk-t2{animation-delay:1.62s}.rlk-t3{animation-delay:1.74s}
.rlk-peek.rlk-t1{animation:rlkTabIn .7s cubic-bezier(.2,.8,.2,1) 1.5s both,rlkPeek 6s ease-in-out 3.4s infinite}
.rlk-peek.rlk-t2{animation:rlkTabIn .7s cubic-bezier(.2,.8,.2,1) 1.62s both,rlkPeek 6s ease-in-out 5.4s infinite}
.rlk-peek.rlk-t3{animation:rlkTabIn .7s cubic-bezier(.2,.8,.2,1) 1.74s both,rlkPeek 6s ease-in-out 7.4s infinite}
.rlk-card{position:relative;color:${t === 'escuro' ? '#fff' : '#1D1933'};border-radius:28px;padding:32px 30px 28px;box-sizing:border-box;box-shadow:0 2px 4px rgba(20,10,60,.08),0 40px 80px -28px rgba(10,5,35,.7);display:flex;flex-direction:column;gap:14px;text-align:left}
.rlk-orbit{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.rlk-orbit rect{stroke-dasharray:0 100;opacity:0;animation:rlkOrbitIn 1.6s cubic-bezier(.6,.1,.2,1) 1.6s forwards,rlkOrbit 7s linear 3.2s infinite}
.rlk-cardhead{display:flex;align-items:center;justify-content:space-between;gap:12px}
.rlk-cardtitle{display:flex;flex-direction:column;gap:6px}
.rlk-cardeyebrow{font-size:11px;font-weight:800;letter-spacing:.2em}
.rlk-cardh2{margin:0;font-weight:800;font-size:28px;letter-spacing:-.035em;color:${t === 'escuro' ? '#fff' : '#1D1933'}}
.rlk-cardlogo{flex-shrink:0}
.rlk-logo-in{display:flex;animation:rlkLogo .9s cubic-bezier(.2,.8,.2,1) 1.05s both}
.rlk-foot{position:absolute;left:44px;bottom:26px;font-size:12px}

.rlk-up{animation:rlkUp .9s cubic-bezier(.2,.8,.2,1) both}
.rlk-pop{animation:rlkPop 1s cubic-bezier(.2,.8,.2,1) .8s both}
.rlk-d1{animation-delay:.15s}.rlk-d2{animation-delay:.5s}.rlk-d3{animation-delay:.65s}.rlk-d7{animation-delay:1.35s}
.rlk-q1{animation-delay:1.7s}.rlk-q2{animation-delay:1.85s}.rlk-q3{animation-delay:2s}

@keyframes rlkFade{from{opacity:0}to{opacity:1}}
@keyframes rlkGridPan{from{background-position:0 0}to{background-position:64px 128px}}
@keyframes rlkPxPan{to{transform:translate(64px,128px)}}
@keyframes rlkPx{0%,100%{opacity:0}12%,30%{opacity:1}44%{opacity:0}}
@keyframes rlkRise{0%{transform:translateY(0) rotate(0);opacity:0}10%{opacity:1}85%{opacity:1}100%{transform:translateY(-1100px) rotate(240deg);opacity:0}}
@keyframes rlkDraw{to{stroke-dashoffset:0}}
@keyframes rlkRun{to{stroke-dashoffset:-422}}
@keyframes rlkUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes rlkPop{from{opacity:0;transform:translateY(36px) scale(.97)}to{opacity:1;transform:none}}
@keyframes rlkLogo{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:none}}
@keyframes rlkMarker{to{transform:scaleX(1)}}
@keyframes rlkMk{0%{background-size:0% 2px;color:#fff}8%,30%{background-size:100% 2px;color:#FFD9C2}38%,100%{background-size:0% 2px;color:#fff}}
@keyframes rlkWup{to{transform:none}}
@keyframes rlkTabIn{to{transform:none}}
@keyframes rlkPeek{0%,30%,100%{transform:none}12%,20%{transform:scaleX(1.45)}}
@keyframes rlkType{to{max-width:4.2em}}
@keyframes rlkCaret{50%{border-right-color:transparent}}
@keyframes rlkSlam{0%{opacity:0;transform:scale(2.4) rotate(-40deg)}60%{opacity:1;transform:scale(.9) rotate(-12deg)}100%{opacity:1;transform:rotate(-12deg)}}
@keyframes rlkSpin{to{transform:rotate(360deg)}}
@keyframes rlkOrbitIn{0%{opacity:1;stroke-dasharray:0 100}100%{opacity:1;stroke-dasharray:12 88}}
@keyframes rlkOrbit{from{stroke-dashoffset:0}to{stroke-dashoffset:-100}}

@media (max-width:980px){
  .rlk-main{flex-direction:column;align-items:stretch;gap:36px;padding:48px 32px 96px}
  .rlk-left{max-width:none}
  .rlk-cardwrap{max-width:460px;margin:0 auto;width:100%}
  .rlk-tabs{right:auto;left:32px;top:-26px;flex-direction:row}
  .rlk-tb{width:58px;height:26px;border-radius:0 0 10px 10px;transform:translateY(-100%);transform-origin:50% 0}
  .rlk-h1{font-size:42px}
}
@media (max-width:640px){
  .rlk-main{padding:32px 20px 24px;gap:24px}
  .rlk-artnum{font-size:44px}
  .rlk-art-ef{padding-right:96px}
  .rlk-stampwrap{width:92px;height:92px;margin-top:-46px}
  .rlk-h1{font-size:30px;line-height:1.1}
  .rlk-para:nth-child(1),.rlk-para:nth-child(2){display:none}
  .rlk-trace{width:420px;height:408px;right:-150px;top:auto;bottom:-40px}
  .rlk-card{border-radius:26px;padding:28px 22px 24px}
  .rlk-foot{position:static;left:auto;bottom:auto;padding:4px 20px 18px;text-align:center}
}
@media (prefers-reduced-motion:reduce){
  .rlk-root *{animation:none!important}
  .rlk-trace path:first-child{stroke-dashoffset:0}
  .rlk-run{opacity:0}.rlk-px,.rlk-sh,.rlk-orbit rect{opacity:0}
  .rlk-w>span{transform:none}.rlk-hlwrap::before{transform:scaleX(1)}
  .rlk-tw{max-width:none;border-right-color:transparent}
  .rlk-stamp{opacity:1;transform:rotate(-12deg)}
  .rlk-tb{transform:none}.rlk-mk{background-size:0% 2px}
}
`
}
