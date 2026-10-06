'use client'

/**
 * Loading VND — CIRCUITO "estilo MEQ" (slugs `vnd-loading-circuito`, `-simula`,
 * `-circuito-vertical`, `-circuito-vertical-simula`). PORTE FIEL dos mockups
 * `design/LoadingVND3*.dc.html` (claro/escuro + Simula + Vertical + VerticalSimula).
 *
 * O "circuito" é o próprio "V" tratado como traçado: um V GIGANTE no fundo (outline `ol`
 * desenhando + 3 pulsos dourados `pl` viajando), e no centro o V preenchido (`mfill`) com
 * contorno desenhando (`mdraw`) e um pulso dourado correndo ao redor (`mrun`).
 * Flags: `simula` → lockup "SIMULA" no topo; `vertical` → "V em cima" + VND pequeno abaixo.
 *
 * Prefixo `vlc-`. reduced-motion mostra o estado final.
 */

import { cn } from '@/lib/utils'

export type VndCircTheme = 'claro' | 'escuro'

// Path do "V" (viewBox 0.6 5.4 31 21.3) e do wordmark "ND" (viewBox 38 23 292 96) — dos mockups.
const V = 'M1.00 5.90L11.51 5.77Q12.20 5.76 12.53 6.13L21.21 15.98Q21.47 16.25 21.57 15.86L21.60 8.10C21.60 7.05 20.81 6.30 19.76 5.88L30.57 5.90Q31.00 5.91 30.74 6.33L23.18 14.49C22.26 15.55 21.80 16.65 21.73 18.23L21.67 25.45Q21.60 26.24 20.95 25.96L6.03 8.31C4.78 6.96 3.14 6.19 1.00 5.90Z'
const ND_N = 'M40 116 L40 37 Q40 26 50 26 Q55 26 59 31 L143 96 L143 27 L157 27 L157 116 L145 116 Q141 116 137 113 L56 47 L56 116 Z'
const ND_D = 'M189 25 L284 25 C310 25 327 42 327 64 L327 80 C327 101 311 117 290 117 L198 117 L198 47 L212 47 L212 102 L288 102 C302 102 312 92 312 80 L312 64 C312 50 300 39 284 39 L189 39 Q186 39 186 36 L186 28 Q186 25 189 25 Z'

const BG: Record<VndCircTheme, string> = {
  claro: 'linear-gradient(180deg,#041A10 0%,#072D1C 50%,#0B3D26 100%)',
  escuro: 'linear-gradient(180deg,#020906 0%,#03100A 50%,#051A10 100%)',
}
const GLOW: Record<VndCircTheme, string> = {
  claro: 'radial-gradient(closest-side, rgba(34,197,110,.32), rgba(0,0,0,0))',
  escuro: 'radial-gradient(closest-side, rgba(34,197,110,.18), rgba(0,0,0,0))',
}
const FOOT: Record<VndCircTheme, string> = { claro: '#7FA893', escuro: '#5E7F6E' }

export function LoadingVndCircuito({
  theme = 'claro', message, simula = false, vertical = false,
}: {
  theme?: VndCircTheme
  message?: string
  simula?: boolean
  vertical?: boolean
}) {
  const foot = FOOT[theme]
  // V central preenchido + contorno desenhando + pulso correndo (comum aos 2 layouts).
  const marca = (
    <div className="vlc-mark">
      <svg className="vlc-mfill" viewBox="0.6 5.4 31 21.3" aria-hidden="true">
        <defs><linearGradient id="vlcG" x1="0" y1="0" x2="0" y2="1"><stop offset="0.1" stopColor="#3FD58A" /><stop offset="0.9" stopColor="#1E9E5E" /></linearGradient></defs>
        <path fill="url(#vlcG)" fillRule="evenodd" d={V} />
      </svg>
      <svg className="vlc-mdraw" viewBox="0.6 5.4 31 21.3" aria-hidden="true"><path pathLength={1000} fill="none" stroke="#9BF0C3" strokeWidth={0.1503} strokeLinejoin="round" d={V} /></svg>
      <svg className="vlc-mrunbox" viewBox="-0.64 4.16 33.48 23.78" aria-hidden="true"><path className="vlc-mrun" pathLength={1000} fill="none" stroke="#E8C877" strokeWidth={0.2442} strokeLinecap="round" d={V} /></svg>
    </div>
  )
  const ndSvg = (
    <svg viewBox="38 23 292 96" role="img" aria-label="ND" className="vlc-nd"><path fill="#FFFFFF" d={ND_N} /><path fill="#FFFFFF" d={ND_D} /></svg>
  )

  return (
    <div className={cn('vlc-root', vertical && 'vlc-vert')}>
      <style>{css(theme, vertical)}</style>

      <div className="vlc-glow" style={{ background: GLOW[theme] }} aria-hidden="true" />

      {/* Circuito de fundo: V gigante — contorno desenha + 3 pulsos dourados viajam. */}
      <svg className="vlc-circ" viewBox="0.6 5.4 31 21.3" aria-hidden="true">
        <path className="vlc-ol" pathLength={1000} fill="none" stroke="#5FD69B" strokeOpacity={0.22} strokeWidth={0.0177} d={V} />
        <path className="vlc-pl vlc-pl1" pathLength={1000} fill="none" stroke="#E8C877" strokeWidth={0.0325} strokeLinecap="round" d={V} />
        <path className="vlc-pl vlc-pl2" pathLength={1000} fill="none" stroke="#E8C877" strokeWidth={0.0325} strokeLinecap="round" d={V} />
        <path className="vlc-pl vlc-pl3" pathLength={1000} fill="none" stroke="#E8C877" strokeWidth={0.0325} strokeLinecap="round" d={V} />
      </svg>

      <main role="status" aria-live="polite" className="vlc-main">
        {simula ? (
          <div className="vlc-sim" aria-label="SIMULA">
            <div className="vlc-sim-letras">{['S', 'I', 'M', 'U', 'L', 'A'].map((l, i) => <span key={l} className={`vlc-sl vlc-s${i + 1}`}>{l}</span>)}</div>
            <span className="vlc-simline" />
          </div>
        ) : null}

        {vertical ? (
          <>
            {marca}
            <div className="vlc-wmk">
              <div className="vlc-wmk-row" role="img" aria-label="VND">
                <svg viewBox="0.6 5.4 31 21.3" aria-hidden="true" className="vlc-wmk-v"><path fill="#FFFFFF" d={V} /></svg>
                <svg viewBox="38 23 292 96" aria-hidden="true" className="vlc-wmk-nd"><path fill="#FFFFFF" d={ND_N} /><path fill="#FFFFFF" d={ND_D} /></svg>
              </div>
              <span className="vlc-sub-line">VOCÊ NA DEFENSORIA</span>
            </div>
          </>
        ) : (
          <div className="vlc-lockup">
            {marca}
            <div className="vlc-ndw">
              {ndSvg}
              <div className="vlc-sub"><span className="vlc-sub-sm">VOCÊ NA</span><span>DEFENSORIA</span></div>
            </div>
          </div>
        )}

        <div className="vlc-load" role="img" aria-label="Carregando">
          <span className="vlc-pt vlc-pa1" /><span className="vlc-pt vlc-pa2" /><span className="vlc-pt vlc-pa3" />
        </div>

        {message ? <p className="vlc-msg" style={{ color: foot }}>{message}</p> : null}
      </main>

      <div className="vlc-foot" style={{ color: foot }}>© 2026 Você na Defensoria</div>
    </div>
  )
}

function css(theme: VndCircTheme, vertical: boolean) {
  return `
.vlc-root{position:relative;overflow:hidden;min-height:100vh;width:100%;background:${BG[theme]};font-family:'Plus Jakarta Sans',sans-serif;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
.vlc-glow{position:absolute;left:50%;top:50%;width:1200px;height:1200px;margin:-600px 0 0 -600px;border-radius:50%;pointer-events:none;animation:vlcFade 1.6s ease-out both}
.vlc-circ{position:absolute;left:-420px;top:-420px;width:2100px;height:1443px;overflow:visible;pointer-events:none}
.vlc-ol{stroke-dasharray:1000;stroke-dashoffset:1000;animation:vlcDraw 3.4s cubic-bezier(.6,.1,.2,1) .1s forwards}
.vlc-pl{stroke-dasharray:40 960;stroke-dashoffset:1000;opacity:0;animation:vlcFade .6s ease-out 2.6s forwards,vlcPulse 8s linear 2.6s infinite}
.vlc-pl2{animation-delay:3s,5.3s}.vlc-pl3{animation-delay:3.3s,8s}
.vlc-main{position:relative;display:flex;flex-direction:column;align-items:center;gap:44px;padding:24px}
.vlc-lockup{display:flex;align-items:flex-start;gap:20px}
.vlc-mark{position:relative;width:330px;height:227px;flex-shrink:0}
.vlc-mark svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.vlc-mfill{animation:vlcMfill .9s cubic-bezier(.2,.8,.2,1) 1.5s both}
.vlc-mdraw path{stroke-dasharray:1000;stroke-dashoffset:1000;animation:vlcDraw 1.6s cubic-bezier(.6,.1,.2,1) .3s forwards}
.vlc-mark .vlc-mrunbox{inset:auto;left:-13.2px;top:-13.2px;width:356.4px;height:253.1px}
.vlc-mrun{opacity:0;stroke-dasharray:70 930;animation:vlcFade .4s ease-out 2.4s forwards,vlcPulse 3.2s linear 2.4s infinite}
.vlc-ndw{display:flex;flex-direction:column;gap:16px;margin-top:45px;animation:vlcNdin .8s cubic-bezier(.2,.8,.2,1) 1.8s both}
.vlc-nd{display:block;width:358.9px;height:118px;overflow:visible}
.vlc-sub{display:flex;flex-direction:column;line-height:1.12;font-weight:800;font-size:19px;letter-spacing:.06em;color:#E9EFEC;padding-left:6px;animation:vlcSubIn 1s cubic-bezier(.2,.8,.2,1) 2.2s both}
.vlc-sub-sm{font-weight:600;color:#CFDCD5}
.vlc-wmk{display:flex;flex-direction:column;align-items:center;gap:16px;animation:vlcRise .9s cubic-bezier(.2,.8,.2,1) 1.9s both}
.vlc-wmk-row{display:flex;align-items:flex-end;gap:4.8px}
.vlc-wmk-v{width:87.3px;height:60px;overflow:visible}
.vlc-wmk-nd{width:182.5px;height:60px;overflow:visible}
.vlc-sub-line{font-size:14px;font-weight:700;letter-spacing:.32em;color:#CFDCD5;padding-left:.32em;animation:vlcSubIn 1s cubic-bezier(.2,.8,.2,1) 2.2s both}
.vlc-sim{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:-10px;animation:vlcFade .4s ease-out both}
.vlc-sim-letras{font-weight:800;font-size:30px;letter-spacing:.32em;padding-left:.32em;color:#FFFFFF;line-height:1}
.vlc-sl{display:inline-block;animation:vlcSl .6s cubic-bezier(.2,.8,.2,1) both}
.vlc-s1{animation-delay:.25s}.vlc-s2{animation-delay:.33s}.vlc-s3{animation-delay:.41s}.vlc-s4{animation-delay:.49s}.vlc-s5{animation-delay:.57s}.vlc-s6{animation-delay:.65s}
.vlc-simline{display:block;width:56%;height:2px;border-radius:2px;background:linear-gradient(90deg,rgba(216,180,90,0),#D8B45A,rgba(216,180,90,0));transform-origin:50% 50%;animation:vlcSimline .7s cubic-bezier(.6,.1,.2,1) .8s both}
.vlc-load{display:flex;align-items:flex-end;gap:12px;height:32px;animation:vlcUp .8s cubic-bezier(.2,.8,.2,1) 2.3s both}
.vlc-pt{width:12px;height:12px;border-radius:50%;background:#3FD58A;animation:vlcPt 1.1s cubic-bezier(.45,0,.55,1) infinite}
.vlc-pa1{animation-delay:2.7s}.vlc-pa2{animation-delay:2.85s}.vlc-pa3{animation-delay:3s}
.vlc-msg{margin:0;font-size:13px;font-weight:500;animation:vlcFade .4s ease-out 3s both}
.vlc-foot{position:absolute;bottom:26px;font-size:12px;animation:vlcFade 1s ease-out .4s both}
@keyframes vlcFade{from{opacity:0}to{opacity:1}}
@keyframes vlcDraw{to{stroke-dashoffset:0}}
@keyframes vlcPulse{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}
@keyframes vlcMfill{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
@keyframes vlcRise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes vlcSubIn{from{opacity:0;letter-spacing:.6em}to{opacity:1}}
@keyframes vlcNdin{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:none}}
@keyframes vlcUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes vlcSl{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes vlcSimline{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes vlcPt{0%,60%,100%{transform:translateY(0);opacity:.55}30%{transform:translateY(-14px);opacity:1;background:#E8C877}}
@media (max-width:640px){
  .vlc-glow{width:620px;height:620px;margin:-310px 0 0 -310px}
  .vlc-circ{left:-220px;top:-200px;width:1100px;height:756px}
  .vlc-main{gap:30px;padding:20px}
  .vlc-lockup{gap:9px;align-items:center}
  .vlc-mark{width:150px;height:103px}
  .vlc-mark .vlc-mrunbox{left:-6px;top:-6px;width:162px;height:115.1px}
  .vlc-ndw{margin-top:0;gap:8px}
  .vlc-nd{width:163px;height:53.6px}
  .vlc-sub{font-size:11px}
  .vlc-pt{width:10px;height:10px}
  .vlc-foot{bottom:20px;font-size:11px}
}
@media (prefers-reduced-motion:reduce){
  .vlc-root *{animation:none!important}
  .vlc-mdraw path,.vlc-ol{stroke-dashoffset:0}
  .vlc-pl,.vlc-mrun{opacity:0}
  .vlc-simline{transform:none}
}
`
}
