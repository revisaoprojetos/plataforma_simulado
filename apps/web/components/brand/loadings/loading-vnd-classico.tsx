'use client'

/**
 * Loading FALLBACK da marca VND — slug `vnd-loading-classico` (spec 02 §1.4/§3.1).
 * Porte FIEL do mockup `design/LoadingVND.dc.html` (claro) e
 * `LoadingVNDEscuro.dc.html` (escuro), com overrides do board mobile
 * `LoadingVNDMobile.dc.html` (breakpoint ≤640px).
 *
 * Sequência: grade de pontos (fade+drift 30s) · glows · "V" draw .3s → vfill
 * 1.2s + glow/pulso · ecos (2º dourado) · "ND" desliza · "VOCÊ NA / DEFENSORIA"
 * · 3 bolinhas saltando (douradas no topo, loop). "Pronto" ~3.0s.
 *
 * Keyframes com prefixo `vl-`/classes `.vl-*`. reduced-motion mostra estado final.
 */

import { MarcaVND, MarcaVndND, VND_V_PATH } from '../brand-marks'

export type VndTheme = 'claro' | 'escuro'

const BG: Record<VndTheme, string> = {
  claro: 'linear-gradient(180deg,#041A10 0%,#072D1C 50%,#0B3D26 100%)',
  escuro: 'linear-gradient(180deg,#020906 0%,#03100A 50%,#051A10 100%)',
}
const FOOT: Record<VndTheme, string> = { claro: '#7FA893', escuro: '#5E7F6E' }
// Opacidade dos 3 glows muda entre claro/escuro (ver mockups).
const GLOW: Record<VndTheme, [string, string, string]> = {
  claro: [
    'radial-gradient(closest-side,rgba(34,197,110,.34),rgba(34,197,110,0))',
    'radial-gradient(closest-side,rgba(52,200,140,.24),rgba(52,200,140,0))',
    'radial-gradient(closest-side,rgba(63,213,138,.2),rgba(63,213,138,0))',
  ],
  escuro: [
    'radial-gradient(closest-side,rgba(34,197,110,.2),rgba(34,197,110,0))',
    'radial-gradient(closest-side,rgba(52,200,140,.12),rgba(52,200,140,0))',
    'radial-gradient(closest-side,rgba(63,213,138,.1),rgba(63,213,138,0))',
  ],
}

export function LoadingVndClassico({
  theme = 'claro',
  message,
  simula = false,
}: {
  theme?: VndTheme
  message?: string
  simula?: boolean
}) {
  const footColor = FOOT[theme]
  const [g1, g2, g3] = GLOW[theme]
  return (
    <div className="vl-root">
      <style>{css(theme)}</style>
      <div className="vl-grid vl-gridIn" aria-hidden="true" />
      <div className="vl-glowIn vl-glow1" style={{ background: g1 }} aria-hidden="true" />
      <div className="vl-glowIn vl-glow2" style={{ background: g2 }} aria-hidden="true" />
      <div className="vl-glowIn vl-glow3" style={{ background: g3 }} aria-hidden="true" />

      <main role="status" aria-live="polite" className="vl-main">
        {simula ? (
          <div className="vl-sim" aria-label="SIMULA">
            <div className="vl-sim-letras">{['S', 'I', 'M', 'U', 'L', 'A'].map((l, i) => <span key={l} className={`vl-sl vl-s${i + 1}`}>{l}</span>)}</div>
            <span className="vl-simline" />
          </div>
        ) : null}
        <div className="vl-lockup">
          <div className="vl-vbox">
            <svg className="vl-vglow" viewBox="0 0 32 32" aria-hidden="true"><path d={VND_V_PATH} fill="rgba(46,210,120,.55)" /></svg>
            <svg className="vl-echo vl-e1" viewBox="0 0 32 32" aria-hidden="true"><path d={VND_V_PATH} fill="none" stroke="rgba(120,230,170,.5)" strokeWidth="0.12" /></svg>
            <svg className="vl-echo vl-e2" viewBox="0 0 32 32" aria-hidden="true"><path d={VND_V_PATH} fill="none" stroke="rgba(216,180,90,.5)" strokeWidth="0.12" /></svg>
            <svg className="vl-echo vl-e3" viewBox="0 0 32 32" aria-hidden="true"><path d={VND_V_PATH} fill="none" stroke="rgba(120,230,170,.5)" strokeWidth="0.12" /></svg>
            <MarcaVND className="vl-vfill" viewBox="0 0 32 32">
              <defs><linearGradient id="vndV" x1="0" y1="0" x2="0" y2="1"><stop offset="0.15" stopColor="#3FD58A" /><stop offset="0.85" stopColor="#1E9E5E" /></linearGradient></defs>
            </MarcaVND>
            <svg className="vl-vdraw" viewBox="0 0 32 32" aria-hidden="true"><path pathLength={1} d={VND_V_PATH} fill="none" stroke="#9BF0C3" strokeWidth="0.14" strokeLinejoin="round" /></svg>
          </div>

          <div className="vl-ndwrap">
            <MarcaVndND className="vl-nd" fill="url(#ndG)" role="img" aria-label="ND">
              <defs><linearGradient id="ndG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#D3DED8" /></linearGradient></defs>
            </MarcaVndND>
            <div className="vl-tag">
              <span className="vl-tag-sm">VOCÊ NA</span>
              <span>DEFENSORIA</span>
            </div>
          </div>
        </div>

        <div className="vl-load" role="img" aria-label="Carregando">
          <span className="vl-pt vl-p1" />
          <span className="vl-pt vl-p2" />
          <span className="vl-pt vl-p3" />
        </div>

        {message ? <p className="vl-msg" style={{ color: footColor }}>{message}</p> : null}
      </main>

      <div className="vl-foot" style={{ color: footColor }}>© 2026 Você na Defensoria</div>
    </div>
  )
}

function css(_theme: VndTheme) {
  return `
.vl-root{position:relative;overflow:hidden;min-height:100vh;width:100%;background:${BG[_theme]};font-family:'Plus Jakarta Sans',sans-serif;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
.vl-grid{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(140,240,185,.2) 1.2px,transparent 1.8px);background-size:28px 28px;-webkit-mask-image:radial-gradient(ellipse 60% 60% at 50% 45%,#000 25%,transparent 80%);mask-image:radial-gradient(ellipse 60% 60% at 50% 45%,#000 25%,transparent 80%)}
.vl-gridIn{animation:vlFade 1.4s ease-out both,vlDrift 30s linear 1.4s infinite}
.vl-glowIn{position:absolute;pointer-events:none;animation:vlFade 1.8s ease-out .1s both}
.vl-glow1{width:1200px;height:1200px;left:50%;top:50%;margin:-640px 0 0 -600px}
.vl-glow2{width:720px;height:720px;right:-240px;bottom:-300px}
.vl-glow3{width:720px;height:720px;left:-260px;top:-280px}
.vl-main{position:relative;display:flex;flex-direction:column;align-items:center;gap:56px;padding:24px}
.vl-lockup{display:flex;align-items:center;gap:8px}
.vl-vbox{position:relative;width:300px;height:300px}
.vl-vbox svg{position:absolute;inset:0;width:100%;height:100%}
.vl-vglow{filter:blur(30px);animation:vlFade 1.4s ease-out 1.1s both,vlVpulse 3s ease-in-out 2.5s infinite alternate}
.vl-echo{transform-origin:67% 80%;opacity:0;animation:vlEcho 3.6s cubic-bezier(.2,.6,.3,1) infinite}
.vl-e1{animation-delay:2.2s}.vl-e2{animation-delay:3.4s}.vl-e3{animation-delay:4.6s}
.vl-vfill{transform-origin:67% 80%;animation:vlVfill .9s cubic-bezier(.2,.8,.2,1.2) 1.2s both}
.vl-vdraw path{stroke-dasharray:1;stroke-dashoffset:1;animation:vlDraw 1.3s cubic-bezier(.6,.1,.2,1) .3s forwards}
.vl-ndwrap{display:flex;flex-direction:column;gap:16px;margin-top:40px;animation:vlNdin .8s cubic-bezier(.2,.8,.2,1) 1.6s both}
.vl-nd{display:block;width:300px;height:99px;overflow:visible}
.vl-tag{display:flex;flex-direction:column;line-height:1.12;font-weight:800;font-size:19px;letter-spacing:.06em;color:#E9EFEC;padding-left:6px;animation:vlUp .8s cubic-bezier(.2,.8,.2,1) 2.4s both}
.vl-tag-sm{font-weight:600;color:#CFDCD5}
.vl-sim{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:-18px;animation:vlFade .4s ease-out both}
.vl-sim-letras{font-weight:800;font-size:30px;letter-spacing:.32em;padding-left:.32em;color:#FFFFFF;line-height:1}
.vl-sl{display:inline-block;animation:vlSl .6s cubic-bezier(.2,.8,.2,1) both}
.vl-s1{animation-delay:.25s}.vl-s2{animation-delay:.33s}.vl-s3{animation-delay:.41s}.vl-s4{animation-delay:.49s}.vl-s5{animation-delay:.57s}.vl-s6{animation-delay:.65s}
.vl-simline{display:block;width:56%;height:2px;border-radius:2px;background:linear-gradient(90deg,rgba(216,180,90,0),#D8B45A,rgba(216,180,90,0));transform-origin:50% 50%;animation:vlSimline .7s cubic-bezier(.6,.1,.2,1) .8s both}
@keyframes vlSl{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes vlSimline{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.vl-load{display:flex;align-items:flex-end;gap:12px;height:32px;animation:vlUp .8s cubic-bezier(.2,.8,.2,1) 2.6s both}
.vl-pt{width:12px;height:12px;border-radius:50%;background:#3FD58A;animation:vlPt 1.1s cubic-bezier(.45,0,.55,1) infinite}
.vl-p1{animation-delay:3s}.vl-p2{animation-delay:3.15s}.vl-p3{animation-delay:3.3s}
.vl-msg{margin:0;font-size:13px;font-weight:500;animation:vlFade .4s ease-out 3s both}
.vl-foot{position:absolute;bottom:26px;font-size:12px;animation:vlFade 1s ease-out .2s both}
@keyframes vlFade{from{opacity:0}to{opacity:1}}
@keyframes vlDrift{from{background-position:0 0}to{background-position:0 -112px}}
@keyframes vlDraw{to{stroke-dashoffset:0}}
@keyframes vlVfill{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:none}}
@keyframes vlVpulse{from{opacity:.55}to{opacity:1}}
@keyframes vlEcho{0%{opacity:0;transform:scale(.7)}15%{opacity:.75}100%{opacity:0;transform:scale(1.35)}}
@keyframes vlNdin{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:none}}
@keyframes vlUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes vlPt{0%,60%,100%{transform:translateY(0);opacity:.55}30%{transform:translateY(-14px);opacity:1;background:#E8C877}}
@media (max-width:640px){
  .vl-grid{background-size:20px 20px;-webkit-mask-image:radial-gradient(ellipse 85% 60% at 50% 45%,#000 25%,transparent 80%);mask-image:radial-gradient(ellipse 85% 60% at 50% 45%,#000 25%,transparent 80%)}
  .vl-glow1{width:700px;height:700px;margin:-380px 0 0 -350px}
  .vl-glow2{width:420px;height:420px;right:-200px;bottom:-180px}
  .vl-glow3{width:420px;height:420px;left:-200px;top:-200px}
  .vl-main{gap:44px;padding:20px}
  .vl-lockup{gap:2px}
  .vl-vbox{width:160px;height:160px}
  .vl-vglow{filter:blur(18px)}
  .vl-ndwrap{gap:8px;margin-top:22px}
  .vl-nd{width:150px;height:49px}
  .vl-tag{font-size:12px}
  .vl-pt{animation-name:vlPtM}
  .vl-foot{bottom:20px;font-size:11px}
}
@keyframes vlPtM{0%,60%,100%{transform:translateY(0);opacity:.55}30%{transform:translateY(-12px);opacity:1;background:#E8C877}}
@media (prefers-reduced-motion:reduce){
  .vl-root *{animation:none!important}
  .vl-vdraw path{stroke-dashoffset:0}
  .vl-echo{opacity:0}
  .vl-simline{transform:none}
}
`
}
