'use client'

// VND · LOGIN DIVIDIDO (spec 02 §2.4 "dividido") — mockups LoginV5*.
// Painel verde 54% à esquerda (chevrons + sweep + SIMULA/linha + lockup + frase
// rotativa/ticker + bullets); formulário em fundo CLARO à direita, SEM card
// (max-width 400px). Mobile = painel 330px no topo + formulário como sheet
// (margin-top:-26px, raio 26px). Título "Bem-vindo", CTA "Entrar na plataforma".
// Prefixo: vld-.

import { LoginForm } from '../login-form'
import type { LoginFormTokens, LoginVariantProps } from '../types'
import { HeaderMarca, SimulaLockup, LockupVND, LineIcon } from './shared'

const P = 'vld'

// No dividido o FORMULÁRIO fica num fundo claro (claro) ou escuro-glass (escuro).
const TOKENS: Record<'claro' | 'escuro', LoginFormTokens> = {
  claro: {
    fg: '#0B1F15', muted: '#5E7368', fieldBg: '#FFFFFF', fieldBorder: '#DDE6E0', fieldFg: '#0B1F15',
    primary: '#0F7A44', ctaBg: 'linear-gradient(180deg,#14924F,#0C6E3C)', ctaFg: '#ffffff',
    pillBg: '#FFFFFF', pillFg: '#2A3A32', pillBorder: '#DCE5DF',
  },
  escuro: {
    fg: '#FFFFFF', muted: '#9DB5A8', fieldBg: 'rgba(255,255,255,.04)', fieldBorder: 'rgba(120,230,170,.16)', fieldFg: '#FFFFFF',
    primary: '#3FD58A', ctaBg: 'linear-gradient(180deg,#14924F,#0C6E3C)', ctaFg: '#ffffff',
    pillBg: 'rgba(255,255,255,.06)', pillFg: '#D4EADD', pillBorder: 'rgba(255,255,255,.16)',
  },
}

const PAGE_BG = { claro: '#F5F8F6', escuro: '#0A120E' }
const PANEL_BG = {
  claro: 'linear-gradient(165deg,#062A1B 0%,#0B4A2E 55%,#12643D 100%)',
  escuro: 'linear-gradient(165deg,#03140C 0%,#06241A 55%,#0A3323 100%)',
}

const BULLETS = [
  { icon: <><rect x={8} y={2} width={8} height={4} rx={1} /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>, t: 'Simulados no padrão da prova', c: 'p1' },
  { icon: <path d="M13 2 3 14h9l-1 8 10-12h-9z" />, t: 'Correção automática na hora', c: 'p2' },
  { icon: <><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>, t: 'Sua evolução a cada tentativa', c: 'p3' },
]

const TICKER = ['Defensor(a) Público(a).', 'Analista da Defensoria.', 'Técnico(a) da Defensoria.', 'Defensor(a) Público(a).']

export function VndDividido({ theme, core, preview, simula }: LoginVariantProps & { simula: boolean }) {
  const t = theme === 'escuro' ? 'escuro' : 'claro'
  const greet = core.modo === 'admin' ? 'Acesso da equipe' : 'Bem-vindo'
  const greetSub = core.modo === 'admin'
    ? 'Entre com o seu e-mail e senha de administrador.'
    : 'Entre com o seu e-mail e continue de onde parou.'

  return (
    <div
      className={`${P}-root`}
      style={{
        position: 'relative', overflow: 'hidden', minHeight: '100vh', display: 'flex',
        background: PAGE_BG[t], fontFamily: "'Plus Jakarta Sans', sans-serif", color: t === 'escuro' ? '#FFFFFF' : '#0B1F15',
        ['--vld-page' as any]: PAGE_BG[t],
      }}
    >
      <style>{css}</style>

      {/* ── PAINEL ── */}
      <section className={`${P}-panel`} style={{ position: 'relative', overflow: 'hidden', background: PANEL_BG[t], color: '#FFFFFF', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div className={`${P}-dotsbg`} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(circle,rgba(185,245,212,.18) 1.2px,transparent 1.8px)', backgroundSize: '28px 28px', WebkitMaskImage: 'linear-gradient(180deg,#000,transparent 85%)', maskImage: 'linear-gradient(180deg,#000,transparent 85%)' }} />
        <svg className={`${P}-chev ${P}-ch1`} viewBox="0 0 200 120" aria-hidden="true" preserveAspectRatio="none" style={{ position: 'absolute', left: '-8%', width: '116%', height: 360, bottom: -50, pointerEvents: 'none' }}><path d="M0 0 L100 112 L200 0" fill="none" stroke="rgba(232,200,119,.6)" strokeWidth={2} vectorEffect="non-scaling-stroke" /></svg>
        <svg className={`${P}-chev ${P}-ch2`} viewBox="0 0 200 120" aria-hidden="true" preserveAspectRatio="none" style={{ position: 'absolute', left: '-8%', width: '116%', height: 360, bottom: 14, pointerEvents: 'none' }}><path d="M0 0 L100 112 L200 0" fill="none" stroke="rgba(185,245,212,.16)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" /></svg>
        <svg className={`${P}-chev ${P}-ch3`} viewBox="0 0 200 120" aria-hidden="true" preserveAspectRatio="none" style={{ position: 'absolute', left: '-8%', width: '116%', height: 360, bottom: 78, pointerEvents: 'none' }}><path d="M0 0 L100 112 L200 0" fill="none" stroke="rgba(185,245,212,.16)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" /></svg>
        <span className={`${P}-sweep`} aria-hidden="true" style={{ position: 'absolute', top: '-20%', bottom: '-20%', width: '30%', left: '-40%', background: 'linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.07),rgba(255,255,255,0))', transform: 'skewX(-18deg)', pointerEvents: 'none' }} />

        <div className={`${P}-up ${P}-d0 ${P}-brandrow`} style={{ position: 'relative' }}>
          <HeaderMarca />
        </div>

        <div className={`${P}-panelmid`} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 34 }}>
          <div className={`${P}-up ${P}-d1`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 20 }}>
            <SimulaLockup P={P} simula={simula} align="start" size={24} />
            <LockupVND P={P} scale={1} gradId="vldVg" />
          </div>
          <div className={`${P}-up ${P}-d3 ${P}-ticker`} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2 }}>
            <span style={{ color: '#CFE3D7', fontWeight: 600 }}>Simulados para quem vai ser</span>
            <span style={{ display: 'block', height: '1.2em', overflow: 'hidden' }}>
              <span className={`${P}-tick`} style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2em', color: '#F1D48A' }}>
                {TICKER.map((w, i) => <span key={i}>{w}</span>)}
              </span>
            </span>
          </div>
          <ul className={`${P}-bullets`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {BULLETS.map((b) => (
              <li key={b.t} className={`${P}-up ${P}-${b.c}`} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600, color: '#E9EFEC' }}>
                <span style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(185,245,212,.2)', color: '#7BEAB0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LineIcon size={17} d={b.icon} />
                </span>
                {b.t}
              </li>
            ))}
          </ul>
        </div>

        <div className={`${P}-up ${P}-d7 ${P}-panelfoot`} style={{ position: 'relative', fontSize: 12, color: '#9DC9B0' }}>© 2026 Você na Defensoria</div>
      </section>

      {/* ── FORMULÁRIO (sem card) ── */}
      <main className={`${P}-formarea`} style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
        <div className={`${P}-formwrap`} style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className={`${P}-up ${P}-d4`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h2 className={`${P}-greet`} style={{ margin: 0, fontWeight: 800, letterSpacing: '-0.04em', color: TOKENS[t].fg }}>{greet}</h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: TOKENS[t].muted }}>{greetSub}</p>
          </div>
          {/* LoginForm SEM wrapper de card; esconde o título interno (já temos o greet). */}
          <div className={`${P}-up ${P}-d6`}>
            <LoginForm brand="vnd" theme={theme} core={core} tokens={TOKENS[t]} preview={preview}
              centro={false} mostrarTitulo={false} ctaLabel="Entrar na plataforma" />
          </div>
        </div>
      </main>
    </div>
  )
}

const css = `
.${P}-root a{color:#0F7A44}
.${P}-panel{width:54%;flex-shrink:0;padding:44px 64px}
.${P}-formarea{padding:48px 56px}
.${P}-greet{font-size:34px}

.${P}-panel{animation:${P}-panelIn 1s cubic-bezier(.2,.8,.2,1) both}
.${P}-dotsbg{animation:${P}-fade 1.4s ease-out .3s both, ${P}-drift 30s linear 1.4s infinite}
.${P}-chev{opacity:0;animation:${P}-chevIn 1.2s cubic-bezier(.2,.8,.2,1) both, ${P}-float 8s ease-in-out infinite alternate}
.${P}-ch1{animation-delay:.5s,1.7s}.${P}-ch2{animation-delay:.65s,2.2s}.${P}-ch3{animation-delay:.8s,2.7s}
.${P}-sweep{animation:${P}-sweep 7s ease-in-out 2s infinite}
.${P}-vdraw path{stroke-dasharray:1000;stroke-dashoffset:1000;animation:${P}-draw 1.4s cubic-bezier(.6,.1,.2,1) .5s forwards}
.${P}-vfill{animation:${P}-vfill .8s cubic-bezier(.2,.8,.2,1.2) 1.4s both}
.${P}-ndw{animation:${P}-ndin .8s cubic-bezier(.2,.8,.2,1) 1.6s both}
.${P}-tick{animation:${P}-ticka 7.5s cubic-bezier(.6,.1,.2,1) 2s infinite}
.${P}-up{animation:${P}-up .9s cubic-bezier(.2,.8,.2,1) both}
.${P}-d0{animation-delay:.2s}.${P}-d1{animation-delay:.3s}.${P}-d3{animation-delay:1.7s}.${P}-d4{animation-delay:.6s}.${P}-d6{animation-delay:.9s}.${P}-d7{animation-delay:1.1s}
.${P}-p1{animation-delay:1.9s}.${P}-p2{animation-delay:2.05s}.${P}-p3{animation-delay:2.2s}

.${P}-sl{display:inline-block;animation:${P}-slk .6s cubic-bezier(.2,.8,.2,1) both}
.${P}-s1{animation-delay:.35s}.${P}-s2{animation-delay:.43s}.${P}-s3{animation-delay:.51s}.${P}-s4{animation-delay:.59s}.${P}-s5{animation-delay:.67s}.${P}-s6{animation-delay:.75s}
.${P}-simline{transform-origin:0 50%;animation:${P}-grow .7s cubic-bezier(.6,.1,.2,1) .9s both}

@keyframes ${P}-fade{from{opacity:0}to{opacity:1}}
@keyframes ${P}-drift{from{background-position:0 0}to{background-position:0 -112px}}
@keyframes ${P}-panelIn{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes ${P}-chevIn{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}
@keyframes ${P}-float{from{translate:0 0}to{translate:0 -14px}}
@keyframes ${P}-sweep{0%{left:-40%}45%,100%{left:130%}}
@keyframes ${P}-draw{to{stroke-dashoffset:0}}
@keyframes ${P}-vfill{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:none}}
@keyframes ${P}-ndin{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}}
@keyframes ${P}-up{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@keyframes ${P}-ticka{0%,22%{transform:translateY(0)}30%,55%{transform:translateY(-1.2em)}63%,88%{transform:translateY(-2.4em)}96%,100%{transform:translateY(-3.6em)}}
@keyframes ${P}-slk{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes ${P}-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}

@media (max-width:640px){
  .${P}-root{flex-direction:column}
  .${P}-panel{width:100%;height:330px;flex-shrink:0;padding:46px 22px 0;justify-content:flex-start;gap:18px}
  .${P}-panelmid{gap:16px}
  .${P}-ticker{font-size:22px}
  .${P}-bullets{display:none}
  .${P}-panelfoot{display:none}
  .${P}-brandrow{display:flex;justify-content:center}
  .${P}-panel .${P}-d1{align-items:center}
  .${P}-formarea{z-index:1;margin-top:-26px;flex:1;background:var(--vld-page);border-radius:26px 26px 0 0;padding:24px 20px 76px;align-items:stretch}
  .${P}-formwrap{max-width:none;gap:16px}
  .${P}-greet{font-size:25px}
}
@media (prefers-reduced-motion:reduce){
  .${P}-root *{animation:none!important}
  .${P}-vdraw path{stroke-dashoffset:0}
  .${P}-chev{opacity:1}
}
`
