'use client'

// SIMULADO — VND · peças compartilhadas (spec 06 §0). bgfx, marca, card 3D,
// botões primário/ouro, shell de modal (desktop .mpop / mobile .msh) + confete.
// Cores de marca FIXAS (verde VND + ouro) conforme spec; tokens de tema via var(--*).

import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Acentos de marca fixos (spec §0 "Botão primário").
export const VND_BTN = 'linear-gradient(180deg,#14924F,#0C6E3C)'
export const VND_BTN_SHADOW = '0 4px 0 #0A4F2C'
export const VND_GOLD = 'linear-gradient(180deg,#F1D48A,#D8B45A)'
export const VND_GOLD_SHADOW = '0 4px 0 #9A7414'
export const VND_GOLD_INK = '#2A1F02'
export const VND_GREEN = '#3FD58A'
export const VND_HERO_BG = 'linear-gradient(140deg,#041A10,#0B4A2E 55%,#12643D)'
export const VND_TILE_BG = 'linear-gradient(160deg,#0F4A2E,#072A1B)'
export const C_OK = '#1FA868'
export const C_ERR = '#E5484D'
export const C_WARN = '#F2A93B'
export const C_TIMER = '#D99A1E'
export const C_STAR = '#E8B23A'

const V_PATH =
  'M1.00 5.90L11.51 5.77Q12.20 5.76 12.53 6.13L21.21 15.98Q21.47 16.25 21.57 15.86L21.60 8.10C21.60 7.05 20.81 6.30 19.76 5.88L30.57 5.90Q31.00 5.91 30.74 6.33L23.18 14.49C22.26 15.55 21.80 16.65 21.73 18.23L21.67 25.45Q21.60 26.24 20.95 25.96L6.03 8.31C4.78 6.96 3.14 6.19 1.00 5.90Z'

/** Logo VND (losango verde). `size` em px. */
export function MarcaVND({ size = 20, radius = 11 }: { size?: number; radius?: number }) {
  return (
    <span
      style={{
        width: size + 16,
        height: size + 16,
        borderRadius: radius,
        background: VND_TILE_BG,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 32 32" style={{ width: size, height: size }} aria-hidden="true">
        <path d={V_PATH} fill={VND_GREEN} />
      </svg>
    </span>
  )
}

/** Keyframes/classes compartilhados por todas as telas VND (prefixo passado por quem usa). */
export function sharedKeyframes(prefix: string) {
  return `
.${prefix}-sbtn{transition:filter .15s,transform .15s}
.${prefix}-sbtn:hover{filter:brightness(1.06);transform:translateY(-1px)}
.${prefix}-sbtn:active{transform:translateY(1px)}
.${prefix}-alt:hover{border-color:var(--selLine)!important}
.${prefix}-cut:hover{color:var(--flag)!important;border-color:var(--flag)!important}
.${prefix}-doc{transition:border-color .2s,transform .2s}
.${prefix}-doc:hover{border-color:var(--selLine);transform:translateY(-2px)}
.${prefix}-rowh{transition:background .2s}.${prefix}-rowh:hover{background:var(--surface2)}
.${prefix}-mbg{animation:${prefix}-fadein .25s ease both}
@keyframes ${prefix}-fadein{from{opacity:0}}
.${prefix}-mpop{animation:${prefix}-mpop .35s cubic-bezier(.22,1,.36,1) both}
@keyframes ${prefix}-mpop{from{opacity:0;transform:translate(-50%,-46%) scale(.96)}}
.${prefix}-msh{animation:${prefix}-msh .35s cubic-bezier(.22,1,.36,1) both}
@keyframes ${prefix}-msh{from{transform:translateY(40px);opacity:0}}
.${prefix}-qin{animation:${prefix}-qin .3s cubic-bezier(.22,1,.36,1) both}
@keyframes ${prefix}-qin{from{opacity:0;transform:translateX(10px)}}
.${prefix}-okpop{animation:${prefix}-okpop .6s cubic-bezier(.34,1.56,.64,1) both}
@keyframes ${prefix}-okpop{from{transform:scale(.4);opacity:0}}
.${prefix}-bar{animation:${prefix}-barw 1s cubic-bezier(.22,1,.36,1) both}
@keyframes ${prefix}-barw{from{width:0}}
.${prefix}-orb{animation:${prefix}-orb 14s ease-in-out infinite alternate}
@keyframes ${prefix}-orb{to{transform:translate(40px,-30px) scale(1.12)}}
.${prefix}-stk{animation:${prefix}-stk 9s ease-in-out infinite alternate}
@keyframes ${prefix}-stk{from{opacity:.3}to{opacity:1;margin-left:40px}}
.${prefix}-cf{animation:${prefix}-cf 3.2s linear infinite}
@keyframes ${prefix}-cf{0%{top:-20px;opacity:0}10%{opacity:1}100%{top:110%;opacity:0}}
@media (prefers-reduced-motion:reduce){
  .${prefix}-orb,.${prefix}-stk,.${prefix}-cf{animation:none!important}
  .${prefix}-mpop,.${prefix}-msh,.${prefix}-qin,.${prefix}-okpop{animation:none!important}
  .${prefix}-bar{animation:none!important}
}
`
}

/**
 * Fundo animado VND (spec §0). `variant='entrada'` traz a faixa escura + chevrons;
 * `variant='soft'` (Prova/Resultado) = só pontos com máscara radial + riscos + orbs.
 * Renderizar UMA vez por tela; conteúdo em z-index:1.
 */
export function Bgfx({ prefix, variant }: { prefix: string; variant: 'entrada' | 'soft' }) {
  const dots =
    variant === 'entrada'
      ? {
          backgroundImage: 'radial-gradient(circle,rgba(63,213,138,.22) 1.2px,transparent 1.8px)',
          backgroundSize: '22px 22px',
          WebkitMaskImage: 'linear-gradient(180deg,#000 30%,transparent 90%)',
          maskImage: 'linear-gradient(180deg,#000 30%,transparent 90%)',
        }
      : {
          backgroundImage: 'radial-gradient(circle,rgba(63,213,138,.2) 1.2px,transparent 1.8px)',
          backgroundSize: '22px 22px',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%,#000,transparent 75%)',
          maskImage: 'radial-gradient(ellipse at 50% 0%,#000,transparent 75%)',
        }
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {variant === 'entrada' && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: 560,
            background: 'linear-gradient(180deg,#041A10 0%,#0B4A2E 55%,transparent 100%)',
          }}
        />
      )}
      <span style={{ position: 'absolute', inset: 0, ...dots }} />
      {STK.map((s, i) => (
        <span
          key={i}
          className={`${prefix}-stk`}
          style={{
            position: 'absolute',
            left: s.left,
            top: '-20%',
            width: s.w,
            height: '140%',
            background: `linear-gradient(180deg,transparent,${s.c},transparent)`,
            transform: 'rotate(28deg)',
            animationDelay: s.d,
          }}
        />
      ))}
      <span
        className={`${prefix}-orb`}
        style={{
          position: 'absolute',
          left: '60%',
          top: -100,
          width: 380,
          height: 380,
          borderRadius: '50%',
          background: 'rgba(232,200,119,.22)',
          filter: 'blur(126px)',
        }}
      />
      <span
        className={`${prefix}-orb`}
        style={{
          position: 'absolute',
          left: -100,
          top: '40%',
          width: 360,
          height: 360,
          borderRadius: '50%',
          background: 'rgba(63,213,138,.18)',
          filter: 'blur(120px)',
          animationDelay: '4s',
        }}
      />
      {variant === 'entrada' && (
        <div style={{ position: 'absolute', inset: 0, opacity: 0.7 }} className={`${prefix}-chev`}>
          {[-90, -50, -10].map((b, i) => (
            <svg
              key={i}
              viewBox="0 0 200 120"
              aria-hidden="true"
              preserveAspectRatio="none"
              style={{ position: 'absolute', right: '-4%', width: '62%', height: 220, bottom: b, pointerEvents: 'none' }}
            >
              <path
                d="M0 0 L100 112 L200 0"
                fill="none"
                stroke={i === 0 ? 'rgba(232,200,119,.55)' : i === 1 ? 'rgba(185,245,212,.14)' : 'rgba(185,245,212,.1)'}
                strokeWidth={i === 0 ? 2 : 1.2}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ))}
        </div>
      )}
    </div>
  )
}

const STK = [
  { left: '12%', top: '-20%', w: 2, c: 'rgba(232,200,119,.55)', d: '0s' },
  { left: '30%', top: '-20%', w: 10, c: 'rgba(63,213,138,.12)', d: '2s' },
  { left: '68%', top: '-20%', w: 2, c: 'rgba(232,200,119,.45)', d: '4s' },
  { left: '84%', top: '-20%', w: 14, c: 'rgba(63,213,138,.1)', d: '1s' },
]

/** Estilo do card 3D VND (borda 2px + sombra sólida). */
export function card3d(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: 'var(--surface)',
    border: '2px solid var(--line)',
    borderRadius: 22,
    boxShadow: '0 5px 0 var(--line)',
    ...extra,
  }
}

/** Botão primário VND (verde 3D). */
export function primaryBtnStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    border: 0,
    background: VND_BTN,
    color: '#FFFFFF',
    boxShadow: VND_BTN_SHADOW,
    fontWeight: 800,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer',
    ...extra,
  }
}

/** Botão fantasma (borda). */
export function ghostBtnStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: 'var(--surface)',
    color: 'var(--ink)',
    border: '1.5px solid var(--line2)',
    fontWeight: 800,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer',
    ...extra,
  }
}

/**
 * Shell do modal VND. Desktop centrado (.mpop) + mobile sheet (.msh) via classes CSS do
 * `prefix`. Faixa 5px gradiente + ícone + título/sub + X. `accent` troca cor do ícone
 * (verde p/ info, âmbar p/ confirmar). `plain` remove cabeçalho (modal de sucesso).
 */
export function ModalShell({
  prefix,
  width = 500,
  onClose,
  icon,
  title,
  subtitle,
  accent = 'var(--selDot)',
  children,
  plain = false,
  closeOnBackdrop = true,
}: {
  prefix: string
  width?: number
  onClose: () => void
  icon?: ReactNode
  title?: string
  subtitle?: string
  accent?: string
  children: ReactNode
  plain?: boolean
  closeOnBackdrop?: boolean
}) {
  return (
    <>
      <div
        onClick={closeOnBackdrop ? onClose : undefined}
        className={`${prefix}-mbg`}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 80,
          background: 'rgba(10,10,25,.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(`${prefix}-mpop`, `${prefix}-sheet`)}
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          width,
          maxWidth: 'calc(100% - 24px)',
          transform: 'translate(-50%,-50%)',
          zIndex: 81,
          maxHeight: 'calc(100% - 24px)',
          overflowY: 'auto',
          borderRadius: 22,
          background: 'var(--surface)',
          boxShadow: '0 40px 80px -30px rgba(0,0,0,.6)',
        }}
      >
        {!plain && (
          <>
            <span
              style={{ display: 'block', height: 5, background: 'linear-gradient(90deg,#0F7A44,#3FD58A 60%,#E8C877)' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '22px 24px 4px' }}>
              {icon && (
                <span
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 16,
                    background: `color-mix(in srgb,${accent} 14%,transparent)`,
                    color: accent,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {icon}
                </span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 19, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{title}</b>
                {subtitle && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{subtitle}</span>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                style={{
                  alignSelf: 'flex-start',
                  width: 34,
                  height: 34,
                  border: 0,
                  borderRadius: 10,
                  background: 'var(--surface2)',
                  color: 'var(--muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>
          </>
        )}
        {children}
      </div>
    </>
  )
}

/** CSS que torna o modal um bottom-sheet no mobile (≤640px). */
export function modalSheetCss(prefix: string) {
  return `
@media (max-width:640px){
  .${prefix}-sheet{
    left:12px!important;right:12px!important;bottom:12px!important;top:auto!important;width:auto!important;
    transform:none!important;max-width:none!important;border-radius:22px!important;
    animation:${prefix}-msh .35s cubic-bezier(.22,1,.36,1) both!important;
  }
}
`
}

/** Confete do herói (spec §3.3). 8 peças, cai em loop. */
const CF = [
  { left: '8%', w: 6, h: 12, bg: '#F1D48A', d: '0s', r: 20 },
  { left: '18%', w: 5, h: 10, bg: '#3FD58A', d: '.4s', r: -30 },
  { left: '30%', w: 7, h: 14, bg: '#FFFFFF', d: '.8s', r: 45 },
  { left: '44%', w: 5, h: 10, bg: '#E8C877', d: '.2s', r: 10 },
  { left: '58%', w: 6, h: 12, bg: '#7BF0B4', d: '.6s', r: -15 },
  { left: '70%', w: 5, h: 10, bg: '#F1D48A', d: '1s', r: 35 },
  { left: '82%', w: 7, h: 14, bg: '#3FD58A', d: '.3s', r: -40 },
  { left: '92%', w: 5, h: 10, bg: '#FFFFFF', d: '.9s', r: 25 },
]

export function Confetti({ prefix }: { prefix: string }) {
  return (
    <>
      {CF.map((c, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`${prefix}-cf`}
          style={{
            position: 'absolute',
            left: c.left,
            top: -20,
            width: c.w,
            height: c.h,
            borderRadius: 2,
            background: c.bg,
            animationDelay: c.d,
            transform: `rotate(${c.r}deg)`,
          }}
        />
      ))}
    </>
  )
}
