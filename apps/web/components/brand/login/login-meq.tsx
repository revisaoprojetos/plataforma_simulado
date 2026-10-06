'use client'

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN — MEQ (spec 02 §1.5/§2.5). Porte FIEL das 3 variantes × 3 temas.
//   meq-login-circuito  → centralizado (circuito + H1 ticker + gauge + chips)
//   meq-login-dividido  → 2 colunas (logo/ticker/parágrafo/3 passos + card c/ barra)
//   meq-login-trilha    → 2 colunas (eyebrow + H1 + rota SVG 01→04 + card c/ 4 seg)
// Temas: claro / azul / escuro (cores hardcoded dos mockups — brand chrome).
// Reaproveita <LoginForm/>, brand-marks e o chrome compartilhado em ./meq/chrome.
// Mobile (≤640px) via overrides no <style> escopado de cada variante.
// ─────────────────────────────────────────────────────────────────────────────

import { List, Target, LineChart } from 'lucide-react'
import { LoginForm } from './login-form'
import type { LoginVariantProps, LoginFormTokens, LoginTheme } from './types'
import {
  CHROME,
  asMeqTheme,
  cardSurface,
  CircuitBg,
  HeaderLockup,
  Ticker,
  baseCss,
  reducedMotionCss,
  type MeqTheme,
} from './meq/chrome'

// Tokens do <LoginForm> por tema (campos/CTA/links/pílula) — spec §5.2.
const TOKENS: Record<MeqTheme, LoginFormTokens> = {
  claro: {
    fg: '#171E3B', muted: '#66729A', fieldBg: '#F5F8FD', fieldBorder: '#DCE3F2', fieldFg: '#171E3B',
    primary: '#306AB5', ctaBg: 'linear-gradient(180deg,#4A8BEA,#2F64C8)', ctaFg: '#FFFFFF',
    pillBg: 'rgba(255,255,255,.7)', pillFg: '#171E3B', pillBorder: 'rgba(23,30,59,.16)',
  },
  // Azul: o card é BRANCO como no claro (mockup), só o chrome ao redor muda.
  azul: {
    fg: '#171E3B', muted: '#66729A', fieldBg: '#F5F8FD', fieldBorder: '#DCE3F2', fieldFg: '#171E3B',
    primary: '#306AB5', ctaBg: 'linear-gradient(180deg,#4A8BEA,#2F64C8)', ctaFg: '#FFFFFF',
    pillBg: 'rgba(255,255,255,.85)', pillFg: '#171E3B', pillBorder: 'rgba(255,255,255,.55)',
  },
  escuro: {
    fg: '#FFFFFF', muted: '#8E9BC4', fieldBg: 'rgba(8,13,32,.55)', fieldBorder: 'rgba(140,170,255,.18)', fieldFg: '#FFFFFF',
    primary: '#7FC3FF', ctaBg: 'linear-gradient(180deg,#4A8BEA,#2F64C8)', ctaFg: '#FFFFFF',
    pillBg: 'rgba(48,106,181,.22)', pillFg: '#FFFFFF', pillBorder: 'rgba(140,170,255,.3)',
  },
}

export function LoginMEQ({ style, theme, core, preview, plataforma, logo }: LoginVariantProps & { style: string }) {
  const t = asMeqTheme(theme)
  const common = { t, theme, core, preview, plataforma }
  void logo // as variantes usam os SVGs de marca MEQ
  if (style === 'meq-login-dividido') return <Dividido {...common} />
  if (style === 'meq-login-trilha') return <Trilha {...common} />
  return <Circuito {...common} />
}

type VProps = {
  t: MeqTheme
  theme: LoginTheme
  core: LoginVariantProps['core']
  preview?: boolean
  plataforma: string
}

// Fonte Sora (não carregada globalmente — só Plus Jakarta + Montserrat).
function SoraFont() {
  return <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap" />
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIANTE 1 — CIRCUITO (centralizado). prefix mlc-
// ═════════════════════════════════════════════════════════════════════════════
function Circuito({ t, theme, core, preview }: VProps) {
  const c = CHROME[t]
  return (
    <div className="mlc-root" style={{ background: c.bg, color: c.cardFg }}>
      <SoraFont />
      <style>{circuitoCss(t)}</style>

      <div className="mlc-glow" aria-hidden="true" style={{ background: c.glowBg }} />
      <CircuitBg prefix="mlc" chrome={c} strokeWidthOl="0.2730" strokeWidthPl="0.4830"
        style={{ left: -520, top: -260, width: 2300, height: 1457 }} />

      <header className="mlc-header mlc-up" aria-label="MEQ Concursos">
        <HeaderLockup chrome={c} />
      </header>

      <main className="mlc-main">
        <div className="mlc-head">
          <h1 className="mlc-h1 mlc-up mlc-d2" style={{ color: c.h1 }}>
            Treino de verdade<br />para <Ticker prefix="mlc" color={c.tickerColor} gradient={c.tickerGradient} lineHeightEm={1.1} />
          </h1>
          <p className="mlc-para mlc-up mlc-d3" style={{ color: c.para }}>
            Entre e continue a sua preparação de onde parou.
          </p>
        </div>

        <div className="mlc-cardwrap mlc-pop">
          <div className="mlc-card" style={cardSurface(c)}>
            <div className="mlc-cardtop">
              <span className="mlc-gauge" aria-hidden="true">
                <span style={{ background: c.gaugeBar }} /><span style={{ background: c.gaugeBar }} />
                <span style={{ background: c.gaugeBar }} /><span style={{ background: c.gaugeBar }} />
              </span>
            </div>
            <LoginForm brand="meq" theme={theme} core={core} tokens={TOKENS[t]} preview={preview}
              tituloAluno="Entrar na plataforma" ctaLabel="Entrar" />
          </div>
        </div>

        <ul className="mlc-chips mlc-up mlc-d7" style={{ color: c.chip }}>
          <li><List className="mlc-ci" style={{ color: c.chipIcon }} />Questões comentadas</li>
          <li><Target className="mlc-ci" style={{ color: c.chipIcon }} />Simulados por banca</li>
          <li><LineChart className="mlc-ci" style={{ color: c.chipIcon }} />Desempenho por matéria</li>
        </ul>
      </main>

      <footer className="mlc-foot mlc-up mlc-d7" style={{ color: c.foot }}>© 2026 MEQ Concursos</footer>
    </div>
  )
}

function circuitoCss(t: MeqTheme) {
  return `
${baseCss('mlc')}
.mlc-glow{position:absolute;left:50%;top:-260px;width:1100px;height:620px;margin-left:-550px;border-radius:50%;pointer-events:none}
.mlc-header{position:relative;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:30px 44px 0}
.mlc-main{position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;padding:24px 24px 100px;box-sizing:border-box;text-align:center}
.mlc-head{display:flex;flex-direction:column;align-items:center;gap:14px;max-width:760px}
.mlc-h1{margin:0;font-weight:700;font-size:54px;line-height:1.1;letter-spacing:-.04em}
.mlc-para{margin:0;font-size:17px;line-height:1.6}
.mlc-cardwrap{position:relative;width:100%;max-width:424px}
.mlc-card{position:relative;border-radius:26px;padding:28px 30px 26px;box-sizing:border-box;box-shadow:0 2px 4px rgba(20,40,90,.05),0 40px 80px -34px rgba(30,60,130,.45);display:flex;flex-direction:column;gap:8px;text-align:left}
.mlc-cardtop{display:flex;align-items:center;justify-content:flex-end}
.mlc-gauge{display:inline-flex;gap:4px}
.mlc-gauge span{display:block;width:14px;height:4px;border-radius:2px;animation:mlcGauge 2.4s ease-in-out infinite}
.mlc-gauge span:nth-child(2){animation-delay:.15s}.mlc-gauge span:nth-child(3){animation-delay:.3s}.mlc-gauge span:nth-child(4){animation-delay:.45s}
@keyframes mlcGauge{0%,100%{opacity:.3}40%{opacity:1}}
.mlc-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 28px;font-size:13px;font-weight:500;list-style:none;margin:0;padding:0}
.mlc-chips li{display:inline-flex;align-items:center;gap:8px}
.mlc-ci{width:16px;height:16px}
.mlc-foot{position:absolute;left:44px;bottom:28px;font-size:12px}
@media (max-width:640px){
  .mlc-glow{width:620px;height:460px;margin-left:-310px;top:-200px}
  .mlc-header{padding:22px 20px 0}
  .mlc-main{gap:26px;padding:18px 18px 96px}
  .mlc-h1{font-size:34px}
  .mlc-para{font-size:15px}
  .mlc-card{padding:24px 22px 22px;border-radius:22px}
  .mlc-chips{display:none}
  .mlc-foot{left:20px;bottom:18px;font-size:11px}
}
${reducedMotionCss('mlc')}
`
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIANTE 2 — DIVIDIDO (2 colunas). prefix mld-
// ═════════════════════════════════════════════════════════════════════════════
const PASSOS = [
  { n: '1', t: 'Escolha banca, órgão e cargo', d: 'Filtre só o que cai na sua prova.', delay: '2.7s' },
  { n: '2', t: 'Resolva questões comentadas', d: 'Entenda o porquê de cada alternativa.', delay: '4.2s' },
  { n: '3', t: 'Acompanhe sua evolução', d: 'Veja onde acertar mais e onde revisar.', delay: '5.7s' },
]

function Dividido({ t, theme, core, preview }: VProps) {
  const c = CHROME[t]
  return (
    <div className="mld-root" style={{ background: c.bg, color: c.cardFg }}>
      <SoraFont />
      <style>{divididoCss(t)}</style>

      <div className="mld-glow" aria-hidden="true" style={{ background: c.glowBg }} />
      <CircuitBg prefix="mld" chrome={c} strokeWidthOl="0.3220" strokeWidthPl="0.5520"
        style={{ left: -380, top: -120, width: 2100, height: 1330 }} />

      <main className="mld-main">
        <section className="mld-left">
          <div className="mld-up mld-d1"><HeaderLockup chrome={c} scale={1.22} /></div>
          <h1 className="mld-h1 mld-up mld-d2" style={{ color: c.h1 }}>
            Treino de verdade<br />para <Ticker prefix="mld" color={c.tickerDividido} lineHeightEm={1.25} />
          </h1>
          <p className="mld-para mld-up mld-d3" style={{ color: c.para }}>
            Questões comentadas, simulados por banca e um raio-x do seu desempenho em cada matéria.
          </p>
          <div className="mld-steps mld-up mld-d6">
            {PASSOS.map((p) => (
              <div className="mld-step" key={p.n}>
                <span className="mld-stepn" style={{ background: c.stepBase, border: `1px solid ${c.stepBorder}`, color: c.stepNumFg, animationDelay: p.delay }}>{p.n}</span>
                <span className="mld-steptxt">
                  <b style={{ color: c.stepTitle }}>{p.t}</b>
                  <span style={{ color: c.stepDesc }}>{p.d}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="mld-cardwrap mld-pop">
          <div className="mld-card" style={cardSurface(c)}>
            <div className="mld-bar" aria-hidden="true">
              {c.cardBar.map((col, i) => <span key={i} style={{ background: col }} />)}
            </div>
            <LoginForm brand="meq" theme={theme} core={core} tokens={TOKENS[t]} preview={preview}
              tituloAluno="Entrar na plataforma" ctaLabel="Entrar" />
          </div>
        </div>
      </main>

      <footer className="mld-foot mld-up mld-d7" style={{ color: c.foot }}>© 2026 MEQ Concursos</footer>
    </div>
  )
}

function divididoCss(t: MeqTheme) {
  return `
${baseCss('mld')}
.mld-glow{position:absolute;right:-10%;top:-30%;width:1000px;height:800px;border-radius:50%;pointer-events:none}
.mld-main{position:relative;flex:1;display:flex;align-items:center;justify-content:center;gap:96px;padding:64px 96px 96px;box-sizing:border-box}
.mld-left{display:flex;flex-direction:column;align-items:flex-start;gap:22px;text-align:left;flex:1;max-width:560px}
.mld-h1{margin:0;font-weight:700;font-size:56px;line-height:1.1;letter-spacing:-.04em}
.mld-para{margin:0;font-size:17px;line-height:1.6;max-width:460px}
.mld-steps{display:flex;flex-direction:column;gap:4px;width:100%;max-width:420px}
.mld-step{display:flex;align-items:flex-start;gap:14px;padding:10px 0}
.mld-stepn{flex-shrink:0;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;animation:mldStepOn 4.5s ease-in-out infinite}
.mld-steptxt{display:flex;flex-direction:column;gap:3px}
.mld-steptxt b{font-size:15px;font-weight:600}
.mld-steptxt span{font-size:13px}
@keyframes mldStepOn{0%,100%{background:${CHROME[t].stepBase};border-color:${CHROME[t].stepBorder}${CHROME[t].stepLitFg ? `;color:${CHROME[t].stepNumFg}` : ''}}10%,30%{background:${CHROME[t].stepLitBg};border-color:${CHROME[t].stepLitBg}${CHROME[t].stepLitFg ? `;color:${CHROME[t].stepLitFg}` : ''}}40%{background:${CHROME[t].stepBase};border-color:${CHROME[t].stepBorder}${CHROME[t].stepLitFg ? `;color:${CHROME[t].stepNumFg}` : ''}}}
.mld-cardwrap{position:relative;width:100%;max-width:430px;flex-shrink:0}
.mld-card{position:relative;border-radius:28px;padding:34px 32px 28px;box-sizing:border-box;box-shadow:0 2px 4px rgba(20,40,90,.05),0 40px 80px -34px rgba(30,60,130,.45);display:flex;flex-direction:column;overflow:hidden}
.mld-bar{position:absolute;left:0;right:0;top:0;height:5px;display:flex;gap:4px}
.mld-bar span{flex:1}
.mld-foot{position:absolute;left:44px;bottom:28px;font-size:12px}
@media (max-width:640px){
  .mld-glow{width:620px;height:500px;right:-20%;top:-20%}
  .mld-main{flex-direction:column;align-items:stretch;gap:28px;padding:36px 20px 96px}
  .mld-left{align-items:flex-start;gap:16px;max-width:none}
  .mld-h1{font-size:34px}
  .mld-para{font-size:15px;max-width:none}
  .mld-steps{display:none}
  .mld-cardwrap{max-width:none}
  .mld-card{padding:28px 22px 22px;border-radius:22px}
  .mld-foot{left:20px;bottom:18px;font-size:11px}
}
${reducedMotionCss('mld')}
`
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIANTE 3 — TRILHA (2 colunas, rota SVG). prefix mlt-
// ═════════════════════════════════════════════════════════════════════════════
const NODES: { cx: number; cy: number; ndDelay: string; coreDelay: string; num: string; label: string; check?: boolean }[] = [
  { cx: 24, cy: 40, ndDelay: '1.40s', coreDelay: '2.74s', num: '01', label: 'Edital' },
  { cx: 220, cy: 80, ndDelay: '1.58s', coreDelay: '4.36s', num: '02', label: 'Questões' },
  { cx: 420, cy: 80, ndDelay: '1.76s', coreDelay: '5.88s', num: '03', label: 'Simulados' },
  { cx: 616, cy: 40, ndDelay: '1.94s', coreDelay: '7.50s', num: '04', label: 'Posse', check: true },
]
const ROUTE_D = 'M24 40 L180 40 L220 80 L420 80 L460 40 L616 40'

function Trilha({ t, theme, core, preview }: VProps) {
  const c = CHROME[t]
  return (
    <div className="mlt-root" style={{ background: c.bg, color: c.cardFg }}>
      <SoraFont />
      <style>{trilhaCss(t)}</style>

      <div className="mlt-glow" aria-hidden="true" style={{ background: c.glowBg }} />
      <CircuitBg prefix="mlt" chrome={c} strokeWidthOl="0.4186" strokeWidthPl="0.7406"
        style={{ left: 760, top: -300, width: 1500, height: 950 }} />

      <header className="mlt-header mlt-up mlt-d1"><HeaderLockup chrome={c} /></header>

      <main className="mlt-main">
        <section className="mlt-left">
          <span className="mlt-eyebrow mlt-up mlt-d2" style={{ color: c.eyebrow }}>
            <span className="mlt-bars" aria-hidden="true">
              <span style={{ background: c.eyebrow, opacity: 0.45 }} />
              <span style={{ background: c.eyebrow, opacity: 0.7 }} />
              <span style={{ background: c.eyebrow, opacity: 1 }} />
            </span>
            SUA TRILHA ATÉ A POSSE
          </span>
          <h1 className="mlt-h1 mlt-up mlt-d3" style={{ color: c.h1 }}>
            Do edital<br />à posse em{' '}
            <Ticker prefix="mlt" color={c.tickerTrilhaColor} gradient={c.tickerTrilhaGradient} lineHeightEm={1.1} />
          </h1>
          <p className="mlt-para mlt-up mlt-d4" style={{ color: c.para }}>
            Cada etapa da sua preparação conectada: do que cai na prova ao simulado que mostra se você está pronto.
          </p>

          <div className="mlt-routewrap mlt-up mlt-d5">
            <svg className="mlt-route" viewBox="0 0 640 190" aria-hidden="true">
              <path className="mlt-rtbase" pathLength={1000} d={ROUTE_D} fill="none" stroke={c.routeBase} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path className="mlt-rtpulse" pathLength={1000} d={ROUTE_D} fill="none" stroke={c.routePulse} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              {NODES.map((n) => (
                <g className="mlt-nd" key={n.num} style={{ animationDelay: n.ndDelay }}>
                  <circle cx={n.cx} cy={n.cy} r={12} fill={c.routeNode} stroke={c.routeNodeStroke} strokeWidth="2" />
                  <circle className="mlt-core" cx={n.cx} cy={n.cy} r={8} fill={c.routeCore} style={{ animationDelay: n.coreDelay }} />
                  {n.check && (
                    <path className="mlt-chk" d={`M${n.cx - 4} ${n.cy}l3 3 6-6`} fill="none" stroke={t === 'escuro' ? '#0B1124' : '#FFFFFF'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: n.coreDelay }} />
                  )}
                  <text x={n.cx} y={n.cy + 36} textAnchor="middle" fontFamily="Sora, sans-serif" fontSize="12" fontWeight="700" letterSpacing="1.2" fill={c.routeNum}>{n.num}</text>
                  <text x={n.cx} y={n.cy + 56} textAnchor="middle" fontFamily="Sora, sans-serif" fontSize="13" fontWeight="600" fill={c.routeLabel}>{n.label}</text>
                </g>
              ))}
            </svg>
          </div>

          <ul className="mlt-chips mlt-up mlt-d7">
            <li style={{ background: c.chipBg, border: `1px solid ${c.chipBorder}`, color: c.chipFg }}><List className="mlt-ci" style={{ color: c.chipIcon }} />Questões comentadas</li>
            <li style={{ background: c.chipBg, border: `1px solid ${c.chipBorder}`, color: c.chipFg }}><Target className="mlt-ci" style={{ color: c.chipIcon }} />Simulados por banca</li>
            <li style={{ background: c.chipBg, border: `1px solid ${c.chipBorder}`, color: c.chipFg }}><LineChart className="mlt-ci" style={{ color: c.chipIcon }} />Raio-x por matéria</li>
          </ul>
        </section>

        <div className="mlt-cardwrap mlt-pop">
          <div className="mlt-card" style={cardSurface(c)}>
            <div className="mlt-bar" aria-hidden="true">
              {c.cardBar.map((col, i) => <span key={i} className="mlt-tseg" style={{ background: col, animationDelay: `${2.6 + i * 0.9}s` }} />)}
            </div>
            <LoginForm brand="meq" theme={theme} core={core} tokens={TOKENS[t]} preview={preview}
              tituloAluno="Entrar na plataforma" ctaLabel="Entrar" />
          </div>
        </div>
      </main>

      <footer className="mlt-foot mlt-up mlt-d7" style={{ color: c.foot }}>© 2026 MEQ Concursos</footer>
    </div>
  )
}

function trilhaCss(t: MeqTheme) {
  return `
${baseCss('mlt')}
.mlt-glow{position:absolute;left:-10%;bottom:-40%;width:1100px;height:900px;border-radius:50%;pointer-events:none}
.mlt-header{position:relative;padding:30px 44px 0}
.mlt-main{position:relative;flex:1;display:flex;align-items:center;justify-content:space-between;gap:72px;padding:24px 110px 100px;box-sizing:border-box}
.mlt-left{flex:1;max-width:660px;display:flex;flex-direction:column;gap:22px}
.mlt-eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:11px;font-weight:700;letter-spacing:.22em}
.mlt-bars{display:inline-flex;align-items:flex-end;gap:3px;height:12px}
.mlt-bars span{display:block;width:4px;border-radius:1px}
.mlt-bars span:nth-child(1){height:6px}.mlt-bars span:nth-child(2){height:9px}.mlt-bars span:nth-child(3){height:12px}
.mlt-h1{margin:0;font-weight:700;font-size:60px;line-height:1.06;letter-spacing:-.045em}
.mlt-para{margin:0;font-size:17px;line-height:1.6;max-width:500px}
.mlt-routewrap{width:100%;max-width:640px}
.mlt-route{width:100%;height:auto;display:block;overflow:visible}
.mlt-rtbase{stroke-dasharray:1000;stroke-dashoffset:1000;animation:mltDraw 1.8s cubic-bezier(.6,.1,.2,1) .6s forwards}
.mlt-rtpulse{stroke-dasharray:60 2000;stroke-dashoffset:60;opacity:0;animation:mltFade .3s ease-out 2.6s forwards,mltRtp 7s linear 2.6s infinite}
@keyframes mltRtp{0%{stroke-dashoffset:60}72%,100%{stroke-dashoffset:-1000}}
.mlt-nd{opacity:0;animation:mltFade .6s ease-out both}
.mlt-core{transform-box:fill-box;transform-origin:center;transform:scale(.35);opacity:.35;animation:mltNodeOn 7s cubic-bezier(.2,.8,.2,1) infinite}
.mlt-chk{opacity:0;animation:mltChkOn 7s ease-out infinite}
@keyframes mltNodeOn{0%{transform:scale(1.15);opacity:1}6%{transform:scale(1);opacity:1}38%{transform:scale(1);opacity:1}48%,100%{transform:scale(.35);opacity:.35}}
@keyframes mltChkOn{0%,38%{opacity:1}48%,100%{opacity:0}}
.mlt-chips{display:flex;gap:10px;flex-wrap:wrap;list-style:none;margin:0;padding:0}
.mlt-chips li{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:999px;font-size:13px;font-weight:500}
.mlt-ci{width:15px;height:15px}
.mlt-cardwrap{position:relative;width:100%;max-width:420px;flex-shrink:0}
.mlt-card{position:relative;border-radius:28px;padding:34px 32px 28px;box-sizing:border-box;box-shadow:0 2px 4px rgba(20,40,90,.05),0 40px 80px -34px rgba(30,60,130,.45);display:flex;flex-direction:column;overflow:hidden}
.mlt-bar{position:absolute;left:0;right:0;top:0;height:5px;display:flex;gap:4px}
.mlt-bar span{flex:1}
.mlt-tseg{opacity:.35;animation:mltTseg 7s ease-in-out infinite}
@keyframes mltTseg{0%{opacity:1}20%{opacity:1}35%,100%{opacity:.35}}
.mlt-foot{position:absolute;left:44px;bottom:28px;font-size:12px}
@media (max-width:640px){
  .mlt-glow{width:620px;height:520px;bottom:-30%}
  .mlt-header{padding:22px 20px 0}
  .mlt-main{flex-direction:column;align-items:stretch;gap:26px;padding:18px 20px 96px}
  .mlt-left{gap:16px;max-width:none}
  .mlt-h1{font-size:36px}
  .mlt-para{font-size:15px;max-width:none}
  .mlt-routewrap,.mlt-chips{display:none}
  .mlt-cardwrap{max-width:none}
  .mlt-card{padding:28px 22px 22px;border-radius:22px}
  .mlt-foot{left:20px;bottom:18px;font-size:11px}
}
${reducedMotionCss('mlt')}
`
}
