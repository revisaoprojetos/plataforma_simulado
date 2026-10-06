'use client'

// SIMULADO — MEQ · peças compartilhadas (spec 06 §0 transversal).
// bgfx (2 orbs + 2 circuitos com pulsos), fonte Sora, modais desktop (.mpop) e
// sheet mobile (.msh), keyframes base e helpers de token.
//
// Tokens vêm de simTokensStyle('meq', theme) aplicado no root de cada tela
// (entrada/prova/resultado). Aqui só usamos var(--…). Acentos fixos de marca
// (azul #4A8BEA→#2F64C8, ciano #5ECEF0, verde Certo, vermelho Errado) conforme spec.

import type { ReactNode } from 'react'
import { MEQ_CIRC_PATHS } from '../../brand-marks'

// ── Acentos fixos de marca (spec §0) ─────────────────────────────────────────
export const MEQ_BRAND_GRAD = 'linear-gradient(180deg,#4A8BEA,#2F64C8)'
export const MEQ_BRAND_SHADOW = '0 10px 22px -14px rgba(62,127,224,.9)'
export const MEQ_CYAN = '#5ECEF0'
export const MEQ_NAVY_GRAD = 'linear-gradient(125deg,#171E3B,#25356F 60%,#306AB5)'
export const CERTO_GRAD = 'linear-gradient(180deg,#25B874,#1A9A5E)'
export const ERRADO_GRAD = 'linear-gradient(180deg,#EE5A5F,#D63F44)'
export const OK_GREEN = '#1FA868'
export const ERR_RED = '#E5484D'
export const AMBER = '#F2A93B'

/** Link do Google Fonts para Sora (não carregada globalmente). */
export function SoraLink() {
  return (
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap"
    />
  )
}

// ── Keyframes base + utilitárias (compartilhadas por prefixo de cada tela) ────
// Cada tela injeta seu <style> com prefixo próprio; mas as keyframes são as
// mesmas da spec. Para evitar duplicar nome de keyframe, cada tela as prefixa.
export function baseKeyframes(p: string) {
  return `
.${p}-sbtn{transition:filter .15s,transform .15s}
.${p}-sbtn:hover{filter:brightness(1.06);transform:translateY(-1px)}
.${p}-sbtn:active{transform:translateY(1px)}
.${p}-doc{transition:border-color .2s,transform .2s}
.${p}-doc:hover{border-color:var(--selLine);transform:translateY(-2px)}
.${p}-rowh{transition:background .2s}
.${p}-rowh:hover{background:var(--surface2)}
.${p}-hs{scrollbar-width:none}.${p}-hs::-webkit-scrollbar{display:none}
.${p}-nscroll{scrollbar-width:thin}
.${p}-mbg{animation:${p}fadein .25s ease both}
@keyframes ${p}fadein{from{opacity:0}}
.${p}-mpop{animation:${p}mpop .35s cubic-bezier(.22,1,.36,1) both}
@keyframes ${p}mpop{from{opacity:0;transform:translate(-50%,-46%) scale(.96)}}
.${p}-msh{animation:${p}msh .35s cubic-bezier(.22,1,.36,1) both}
@keyframes ${p}msh{from{transform:translateY(40px);opacity:0}}
.${p}-qin{animation:${p}qin .3s cubic-bezier(.22,1,.36,1) both}
@keyframes ${p}qin{from{opacity:0;transform:translateX(10px)}}
.${p}-okpop{animation:${p}okpop .6s cubic-bezier(.34,1.56,.64,1) both}
@keyframes ${p}okpop{from{transform:scale(.4);opacity:0}}
.${p}-grow{transform-origin:50% 100%;animation:${p}growY 1s cubic-bezier(.22,1,.36,1) both}
@keyframes ${p}growY{from{transform:scaleY(0)}}
.${p}-bar{animation:${p}barw 1s cubic-bezier(.22,1,.36,1) both}
@keyframes ${p}barw{from{width:0}}
.${p}-orb{animation:${p}orb 14s ease-in-out infinite alternate}
@keyframes ${p}orb{to{transform:translate(40px,-30px) scale(1.12)}}
.${p}-circ .${p}-pl{stroke-dasharray:46 954;stroke-dashoffset:1000;animation:${p}pulse 9s linear infinite}
.${p}-circ .${p}-pl2{animation-delay:3s}
.${p}-circ .${p}-pl3{animation-delay:6s}
@keyframes ${p}pulse{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){
  .${p}-orb,.${p}-circ .${p}-pl{animation:none!important}
  .${p}-grow{animation:none!important;transform:none!important}
  .${p}-bar{animation:none!important}
}`
}

// ── bgfx MEQ: 2 orbs + 2 circuitos SVG com pulsos (spec §0). Render UMA vez. ──
export function BgfxMeq({ p }: { p: string }) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <span
        className={`${p}-orb`}
        style={{ position: 'absolute', left: -80, top: -60, width: 380, height: 380, borderRadius: '50%', background: 'rgba(62,127,224,.25)', filter: 'blur(126px)', animationDelay: '0s' }}
      />
      <span
        className={`${p}-orb`}
        style={{ position: 'absolute', left: '72%', top: '45%', width: 420, height: 420, borderRadius: '50%', background: 'rgba(94,206,240,.18)', filter: 'blur(140px)', animationDelay: '4s' }}
      />
      <Circuit p={p} style={{ left: -200, top: -60, width: 900, height: 570 }} ol="#5ECEF0" olOp={0.3} pl="#5ECEF0" />
      <Circuit p={p} style={{ left: '55%', top: '55%', width: 900, height: 570 }} ol="#3E7FE0" olOp={0.25} pl="#8BEAEA" />
    </div>
  )
}

function Circuit({ p, style, ol, olOp, pl }: { p: string; style: React.CSSProperties; ol: string; olOp: number; pl: string }) {
  return (
    <svg className={`${p}-circ`} viewBox="0 0 483 306" style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', ...style }}>
      {MEQ_CIRC_PATHS.map((d, i) => (
        <path key={`ol${i}`} pathLength={1000} fill="none" stroke={ol} strokeOpacity={olOp} strokeWidth={0.644} strokeLinejoin="round" d={d} />
      ))}
      {MEQ_CIRC_PATHS.map((d, i) => (
        <path key={`pl${i}`} className={`${p}-pl ${p}-pl${i + 1}`} pathLength={1000} fill="none" stroke={pl} strokeWidth={1.18} strokeLinecap="round" strokeLinejoin="round" d={d} />
      ))}
    </svg>
  )
}

// ── Backdrop + container de modal (desktop centrado / mobile sheet) ───────────
export function ModalShell({
  p,
  width,
  onClose,
  children,
  closeOnBackdrop = true,
}: {
  p: string
  width: number
  onClose?: () => void
  children: ReactNode
  closeOnBackdrop?: boolean
}) {
  return (
    <>
      <div
        className={`${p}-mbg`}
        onClick={closeOnBackdrop ? onClose : undefined}
        style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(10,10,25,.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      />
      {/* Desktop: centrado. Mobile: bottom-sheet (via classe utilitária no wrapper). */}
      <div className={`${p}-modalwrap`} style={{ position: 'fixed', inset: 0, zIndex: 81, pointerEvents: 'none' }}>
        <div
          role="dialog"
          aria-modal="true"
          className={`${p}-modal ${p}-mpop`}
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            width,
            maxWidth: 'calc(100% - 24px)',
            transform: 'translate(-50%,-50%)',
            maxHeight: 'calc(100% - 24px)',
            overflowY: 'auto',
            borderRadius: 22,
            background: 'var(--surface)',
            boxShadow: '0 40px 80px -30px rgba(0,0,0,.6)',
            pointerEvents: 'auto',
          }}
        >
          {children}
        </div>
      </div>
    </>
  )
}

/** Cabeçalho padrão de modal: faixa 5px gradiente + ícone 50px + título + sub + X. */
export function ModalHead({
  icon,
  iconColor,
  iconBg,
  titulo,
  sub,
  onClose,
}: {
  icon: ReactNode
  iconColor: string
  iconBg: string
  titulo: string
  sub: string
  onClose?: () => void
}) {
  return (
    <>
      <span style={{ display: 'block', height: 5, background: 'linear-gradient(90deg,#171E3B,#3E7FE0 60%,#5ECEF0)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '22px 24px 4px' }}>
        <span style={{ width: 50, height: 50, borderRadius: 12, background: iconBg, color: iconColor, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 19, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{titulo}</b>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{sub}</span>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ alignSelf: 'flex-start', width: 34, height: 34, border: 0, borderRadius: 10, background: 'var(--surface2)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <IconX />
          </button>
        ) : null}
      </div>
    </>
  )
}

// ── Botões utilitários (gradiente de marca / ghost) ──────────────────────────
export function btnPrimary(height = 52): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    width: '100%', height, padding: '0 20px', border: 0, borderRadius: 10,
    background: MEQ_BRAND_GRAD, color: '#fff', boxShadow: MEQ_BRAND_SHADOW,
    font: 'inherit', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
  }
}
export function btnGhost(height = 48): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    width: '100%', height, padding: '0 20px', borderRadius: 10,
    background: 'var(--surface)', color: 'var(--ink)', border: '1.5px solid var(--line2)',
    font: 'inherit', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
  }
}

// ── Ícones (lucide-like, stroke currentColor) — SEM Sparkles ─────────────────
const iBase = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
type IP = { size?: number; sw?: number }

export function IconX({ size = 16 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><path d="M18 6 6 18M6 6l12 12" /></svg>
}
export function IconCheck({ size = 16, sw = 2.6 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={{ ...iBase, strokeWidth: sw }}><path d="M20 6 9 17l-5-5" /></svg>
}
export function IconPlay({ size = 18 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={{ ...iBase, fill: 'currentColor', stroke: 'none' }}><path d="M8 5v14l11-7z" /></svg>
}
export function IconList({ size = 18 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
}
export function IconBook({ size = 18 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><path d="M2 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v14a2 2 0 0 1 2-2h8z" /></svg>
}
export function IconClock({ size = 16 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
}
export function IconMail({ size = 18 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
}
export function IconInfo({ size = 24 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
}
export function IconFlag({ size = 14 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><path d="M4 22V4M4 4h12l-2 4 2 4H4" /></svg>
}
export function IconChart({ size = 16 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></svg>
}
export function IconHome({ size = 15 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
}
export function IconRefresh({ size = 15 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" /><path d="M21 3v5h-5" /></svg>
}
export function IconDownload({ size = 16 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
}
export function IconChevL({ size = 15 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><path d="m15 18-6-6 6-6" /></svg>
}
export function IconChevR({ size = 15 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><path d="m9 18 6-6-6-6" /></svg>
}
export function IconChevD({ size = 16 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><path d="m6 9 6 6 6-6" /></svg>
}
export function IconBulb({ size = 17 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" /></svg>
}
export function IconMoon({ size = 16 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
}
export function IconGrid({ size = 15 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
}
export function IconReturn({ size = 24 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 8" /></svg>
}
export function IconStar({ size = 18 }: IP) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={iBase}><path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8L6.6 19.6l1-6L3.3 9.4l6-.9z" /></svg>
}

// Logo MEQ compacto (marca triângulos) — usado nos headers.
export function MarcaMeq({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 483 306" width={size * 1.27} height={size} aria-hidden style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="meqlg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4A8BEA" /><stop offset="1" stopColor="#2F64C8" /></linearGradient>
      </defs>
      <path fill="url(#meqlg)" d="M241 10 462 296H20z M241 96 362 258H120z" fillRule="evenodd" />
    </svg>
  )
}
