'use client'

/**
 * Loading FALLBACK da marca MEQ — slug `meq-loading-circuito` (spec 02 §1.6/§3.1).
 * Porte FIEL dos mockups `design/LoadingMEQ2Claro.dc.html` (claro),
 * `LoadingMEQ2.dc.html` (azul) e `LoadingMEQ3.dc.html` (escuro), com overrides
 * do board mobile `LoadingMEQ2ClaroMobile.dc.html` (breakpoint ≤640px).
 *
 * Sequência: circuito ao fundo (draw 3.4s + 3 pulsos) · marca mdraw .3s →
 * mfill 1.5s + pulso `mrun` · wordmark "MEQ Concursos" (rise, segmentos pulsando)
 * · barra de 14 segmentos em onda `pg` (10 no mobile). "Pronto" ~2.5s.
 *
 * Keyframes com prefixo `ml-`/classes `.ml-*`. reduced-motion mostra estado final.
 */

import type { CSSProperties } from 'react'
import { MarcaMEQ, MEQ_MARK_PATH, MEQ_MARK_RUN_PATH, MEQ_CIRC_PATHS, MEQ_WORDMARK as W } from '../brand-marks'

export type MeqTheme = 'claro' | 'azul' | 'escuro'

// Config pixel-perfeita por tema (cores/posições extraídas de cada mockup).
type MeqConf = {
  bg: string
  foot: string
  glow: { style: CSSProperties; bg: string }
  circ: { style: CSSProperties; ol: { stroke: string; opacity: string; w: string }; pl: { stroke: string; w: string } }
  mfillGrad: [string, string]
  mdrawStroke: string
  mrunStroke: string
  wordFill: string
  sgFill: string
  concursosOpacity: string
  progFill: string
}

const CONF: Record<MeqTheme, MeqConf> = {
  claro: {
    bg: 'linear-gradient(180deg,#F6F9FE 0%,#EEF3FB 55%,#E3ECF8 100%)',
    foot: '#7D89AE',
    glow: { style: { right: '-10%', top: '-30%', width: 1000, height: 800, borderRadius: '50%' }, bg: 'radial-gradient(closest-side, rgba(94,206,240,.32), rgba(94,206,240,0))' },
    circ: { style: { left: -380, top: -120, width: 2100, height: 1330 }, ol: { stroke: '#306AB5', opacity: '0.2', w: '0.3220' }, pl: { stroke: '#3E7FE0', w: '0.5520' } },
    mfillGrad: ['#2F64C8', '#4497DB'],
    mdrawStroke: '#306AB5',
    mrunStroke: '#5ECEF0',
    wordFill: '#171E3B',
    sgFill: '#3E7FE0',
    concursosOpacity: '1',
    progFill: '#3E7FE0',
  },
  azul: {
    bg: 'linear-gradient(160deg,#2B5FA8 0%,#306AB5 40%,#4497DB 100%)',
    foot: '#DCEBFF',
    glow: { style: { right: '-10%', top: '-30%', width: 1000, height: 800, borderRadius: '50%' }, bg: 'radial-gradient(closest-side, rgba(94,206,240,.65), rgba(94,206,240,0))' },
    circ: { style: { left: -380, top: -120, width: 2100, height: 1330 }, ol: { stroke: '#8BEAEA', opacity: '0.45', w: '0.3220' }, pl: { stroke: '#FFFFFF', w: '0.5520' } },
    mfillGrad: ['#FFFFFF', '#C9F4FF'],
    mdrawStroke: '#FFFFFF',
    mrunStroke: '#171E3B',
    wordFill: '#FFFFFF',
    sgFill: '#171E3B',
    concursosOpacity: '.92',
    progFill: '#FFFFFF',
  },
  escuro: {
    bg: 'linear-gradient(180deg,#121A3A 0%,#141B38 55%,#0B1124 100%)',
    foot: '#6F7CA6',
    glow: { style: { left: '50%', top: '50%', width: 1200, height: 900, margin: '-450px 0 0 -600px', borderRadius: '50%' }, bg: 'radial-gradient(closest-side, rgba(62,127,224,.42), rgba(62,127,224,0))' },
    circ: { style: { left: -520, top: -260, width: 2300, height: 1457 }, ol: { stroke: '#5E8EF0', opacity: '0.3', w: '0.2730' }, pl: { stroke: '#8BEAEA', w: '0.4830' } },
    mfillGrad: ['#4A8BEA', '#5ECEF0'],
    mdrawStroke: '#5ECEF0',
    mrunStroke: '#FFFFFF',
    wordFill: '#FFFFFF',
    sgFill: '#3E7FE0',
    concursosOpacity: '.92',
    progFill: '#5ECEF0',
  },
}

const PROG_COUNT = 14 // 10 no mobile (via :nth-child oculto)

export function LoadingMeqCircuito({
  theme = 'claro',
  message,
}: {
  theme?: MeqTheme
  message?: string
}) {
  const c = CONF[theme]
  return (
    <div className="ml-root">
      {/* Sora não é carregada globalmente (só Plus Jakarta Sans + Montserrat);
          a MEQ usa Sora, então garantimos aqui — como nos mockups. */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap" />
      <style>{css(theme)}</style>
      <div className="ml-glow" style={{ ...c.glow.style, position: 'absolute', background: c.glow.bg, pointerEvents: 'none' }} aria-hidden="true" />

      {/* circuito de fundo */}
      <svg className="ml-circ" viewBox="0 0 483 306" aria-hidden="true" style={{ ...c.circ.style, position: 'absolute', overflow: 'visible', pointerEvents: 'none' }}>
        {MEQ_CIRC_PATHS.map((d, i) => (
          <path key={`ol${i}`} className="ml-ol" pathLength={1000} fill="none" stroke={c.circ.ol.stroke} strokeOpacity={c.circ.ol.opacity} strokeWidth={c.circ.ol.w} strokeLinejoin="round" d={d} />
        ))}
        {MEQ_CIRC_PATHS.map((d, i) => (
          <path key={`pl${i}`} className={`ml-pl ml-pl${i + 1}`} pathLength={1000} fill="none" stroke={c.circ.pl.stroke} strokeWidth={c.circ.pl.w} strokeLinecap="round" strokeLinejoin="round" d={d} />
        ))}
      </svg>

      <main role="status" aria-live="polite" className="ml-main">
        <div className="ml-markbox">
          <MarcaMEQ className="ml-mfill" viewBox="0 0 483 306">
            <defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c.mfillGrad[0]} /><stop offset="1" stopColor={c.mfillGrad[1]} /></linearGradient></defs>
          </MarcaMEQ>
          <svg className="ml-mdraw" viewBox="0 0 483 306" aria-hidden="true"><path pathLength={1000} fill="none" stroke={c.mdrawStroke} strokeWidth="2.273" strokeLinejoin="round" d={MEQ_MARK_PATH} /></svg>
          <svg className="ml-mrunbox" viewBox="-12 -12 507 330" aria-hidden="true"><path className="ml-mrun" pathLength={1000} fill="none" stroke={c.mrunStroke} strokeWidth="3.409" strokeLinecap="round" strokeLinejoin="round" d={MEQ_MARK_RUN_PATH} /></svg>
        </div>

        <svg className="ml-wmk" viewBox="0 0 383 169" aria-hidden="true">
          <path fill={c.wordFill} d={W.m} />
          <path fill={c.wordFill} d={W.e} />
          <path fill={c.wordFill} d={W.q} />
          <path className="ml-sg ml-sg0" fill={c.sgFill} d={W.sg0} />
          <path className="ml-sg ml-sg1" fill={c.sgFill} d={W.sg1} />
          <path className="ml-sg ml-sg2" fill={c.sgFill} d={W.sg2} />
          <path className="ml-sg ml-sg3" fill={c.sgFill} d={W.sg3} />
          <path fill={c.wordFill} fillOpacity={c.concursosOpacity} d={W.concursos} />
        </svg>

        <div className="ml-prog" role="img" aria-label="Carregando">
          {Array.from({ length: PROG_COUNT }).map((_, i) => (
            <span key={i} style={{ background: c.progFill, animationDelay: `${(2.5 + i * 0.09).toFixed(2)}s` }} />
          ))}
        </div>

        {message ? <p className="ml-msg" style={{ color: c.foot }}>{message}</p> : null}
      </main>

      <div className="ml-foot" style={{ color: c.foot }}>© 2026 MEQ Concursos</div>
    </div>
  )
}

function css(theme: MeqTheme) {
  return `
.ml-root{position:relative;overflow:hidden;min-height:100vh;width:100%;background:${CONF[theme].bg};font-family:'Sora',sans-serif;color:#171E3B;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ml-glow{animation:mlFade 1.6s ease-out both,mlBreathe 6s ease-in-out 1.6s infinite alternate}
.ml-ol{stroke-dasharray:1000;stroke-dashoffset:1000;animation:mlDraw 3.4s cubic-bezier(.6,.1,.2,1) .1s forwards}
.ml-pl{stroke-dasharray:46 954;stroke-dashoffset:1000;opacity:0;animation:mlFade .6s ease-out 2.6s forwards,mlPulse 8s linear 2.6s infinite}
.ml-pl2{animation-delay:3s,3s;animation-duration:.6s,10s}
.ml-pl3{animation-delay:3.3s,3.3s;animation-duration:.6s,6.5s}
.ml-main{position:relative;display:flex;flex-direction:column;align-items:center;gap:44px;padding:24px}
.ml-markbox{position:relative;width:340px;height:215px}
.ml-markbox svg{position:absolute;overflow:visible}
.ml-mfill{inset:0;width:100%;height:100%;animation:mlMfill .9s cubic-bezier(.2,.8,.2,1) 1.5s both}
.ml-mdraw{inset:0;width:100%;height:100%}
.ml-mdraw path{stroke-dasharray:1000;stroke-dashoffset:1000;animation:mlDraw 1.6s cubic-bezier(.6,.1,.2,1) .3s forwards}
.ml-mrunbox{left:-8.4px;top:-8.4px;width:356.9px;height:232.3px}
.ml-mrun{opacity:0;stroke-dasharray:70 930;animation:mlFade .4s ease-out 2.4s forwards,mlPulse 3.2s linear 2.4s infinite}
.ml-wmk{width:176.8px;height:78px;flex-shrink:0;overflow:visible;animation:mlRise .9s cubic-bezier(.2,.8,.2,1) 1.9s both}
.ml-sg{opacity:.2;animation:mlSegL 1.9s ease-in-out 2.6s infinite}
.ml-sg1{animation-delay:2.6s}.ml-sg2{animation-delay:2.8s}.ml-sg3{animation-delay:3s}.ml-sg0{animation-delay:3.2s}
.ml-prog{display:flex;gap:5px;animation:mlFade .8s ease-out 2.3s both}
.ml-prog span{display:block;width:18px;height:6px;border-radius:2px;opacity:.22;animation:mlPg 2.6s ease-in-out infinite}
.ml-msg{margin:0;font-size:13px;font-weight:500;animation:mlFade .4s ease-out 2.3s both}
.ml-foot{position:absolute;bottom:26px;font-size:12px;animation:mlFade 1s ease-out .4s both}
@keyframes mlFade{from{opacity:0}to{opacity:1}}
@keyframes mlBreathe{from{opacity:.75}to{opacity:1}}
@keyframes mlDraw{to{stroke-dashoffset:0}}
@keyframes mlPulse{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}
@keyframes mlMfill{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
@keyframes mlRise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes mlSegL{0%{opacity:.2}12%{opacity:1}55%{opacity:1}80%,100%{opacity:.2}}
@keyframes mlPg{0%{opacity:.22}8%{opacity:1}60%{opacity:1}75%,100%{opacity:.22}}
@media (max-width:640px){
  .ml-glow{width:520px!important;height:520px!important;margin:0!important;left:auto!important;right:-10%!important;top:-30%!important}
  .ml-circ{left:-420px!important;top:120px!important;width:1300px!important;height:824px!important}
  .ml-main{gap:30px}
  .ml-markbox{width:200px;height:127px}
  .ml-mrunbox{left:-5px;top:-5px;width:209.9px;height:136.6px}
  .ml-wmk{width:117.8px;height:52px}
  .ml-prog span{width:12px}
  .ml-prog span:nth-child(n+11){display:none}
  .ml-foot{bottom:20px;font-size:11px}
}
@media (prefers-reduced-motion:reduce){
  .ml-root *{animation:none!important}
  .ml-mdraw path{stroke-dashoffset:0}
  .ml-prog span{opacity:1}
  .ml-sg{opacity:1}
  .ml-mrun{opacity:0}
  .ml-pl{opacity:0}
}
`
}
