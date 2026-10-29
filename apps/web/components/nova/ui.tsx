// Primitivos visuais da nova plataforma (porte fiel de gerador/lib.py + COMPONENTES.md).
// Presentational / server-safe. Cores SEMPRE via tokens (--brand, --surface, --ink…), escopados
// sob `.novaplat` no layout. Dourado/roxo da marca Revisão vêm dos tokens, não hardcoded.
import * as React from 'react'
import Link from 'next/link'
import { Icon, RMark, type IconName } from './icons'

type Kids = React.ReactNode

/* ---------- tipografia ---------- */
export function Eyebrow({ children, color = 'var(--accentInk)' }: { children: Kids; color?: string }) {
  return <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', color }}>{children}</span>
}

export function PageTitle({ children, sub }: { children: Kids; sub?: Kids }) {
  return (
    <>
      <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.1, color: 'var(--ink)' }}>{children}</h1>
      {sub ? <p style={{ margin: 0, maxWidth: 680, fontSize: 15, lineHeight: 1.55, color: 'var(--muted)' }}>{sub}</p> : null}
    </>
  )
}

export function H2({ children, style }: { children: Kids; style?: React.CSSProperties }) {
  return <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)', ...style }}>{children}</h2>
}
export function H3({ children }: { children: Kids }) {
  return <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{children}</h3>
}
export function Muted({ children, size = 13 }: { children: Kids; size?: number }) {
  return <span style={{ display: 'block', fontSize: size, lineHeight: 1.5, color: 'var(--muted)' }}>{children}</span>
}
export function P({ children, size = 13.5 }: { children: Kids; size?: number }) {
  return <p style={{ margin: 0, fontSize: size, lineHeight: 1.6, color: 'var(--muted)' }}>{children}</p>
}

/** Cabeçalho de página: etiqueta + título + descrição à esquerda, ação/abas à direita (alinhadas pela base). */
export function PageHeader({ title, sub, eyebrow, right }: { title: Kids; sub?: Kids; eyebrow?: Kids; right?: Kids }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <PageTitle sub={sub}>{title}</PageTitle>
      </div>
      {right}
    </div>
  )
}

export function SecHead({ title, sub, right, eyebrow }: { title: Kids; sub?: Kids; right?: Kids; eyebrow?: Kids }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <H2>{title}</H2>
        {sub ? <Muted size={12.5}>{sub}</Muted> : null}
      </div>
      {right}
    </div>
  )
}

/* ---------- containers ---------- */
export function Card({ children, pad = 20, style, className }: { children: Kids; pad?: number; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={className} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: pad, display: 'flex', flexDirection: 'column', gap: 14, ...style }}>
      {children}
    </div>
  )
}
export function Soft({ children, pad = 14, style }: { children: Kids; pad?: number; style?: React.CSSProperties }) {
  return <div style={{ padding: pad, borderRadius: 14, background: 'var(--surface2)', display: 'flex', flexDirection: 'column', gap: 8, ...style }}>{children}</div>
}
export function Row({ children, gap = 12, style }: { children: Kids; gap?: number; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap, flexWrap: 'wrap', ...style }}>{children}</div>
}
export function Col({ children, gap = 12, style }: { children: Kids; gap?: number; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>
}
export function Grid({ children, cols, min, gap = 16, style }: { children: Kids; cols?: number; min?: number; gap?: number; style?: React.CSSProperties }) {
  // cols fixo OU grid adaptativo ao container (min px) — bom p/ iframe/telas estreitas.
  const gtc = cols ? `repeat(${cols}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(min(100%, ${min ?? 240}px), 1fr))`
  return <div style={{ display: 'grid', gridTemplateColumns: gtc, gap, alignItems: 'stretch', ...style }}>{children}</div>
}
export function Split({ main, aside, right = '340px', gap = 24 }: { main: Kids; aside: Kids; right?: string; gap?: number }) {
  return <div className="np-split" style={{ display: 'grid', gridTemplateColumns: `minmax(0,1fr) ${right}`, gap, alignItems: 'start' }}>{main}{aside}</div>
}

export function Hero({ children, bg = 'var(--nova-hero-bg, linear-gradient(120deg,#160F33 0%,#241A52 55%,#2E1F6A 100%))', style }: { children: Kids; bg?: string; style?: React.CSSProperties }) {
  return (
    <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, background: bg, color: '#FFFFFF', padding: '28px 30px', ...style }}>
      <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '44px 44px', WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 60%)', maskImage: 'linear-gradient(90deg,transparent,#000 60%)' }} />
      <RMark w={240} h={233} color="#FFFFFF" style={{ position: 'absolute', right: -30, bottom: -60, opacity: 0.06 }} />
      {/* Traço amarelo correndo sobre o "R" — mesma animação do banner da Início */}
      <svg aria-hidden viewBox="0 0 68 66" style={{ position: 'absolute', right: -30, bottom: -60, width: 240, height: 233, pointerEvents: 'none', overflow: 'visible' }}>
        <path className="np-hero-run" fill="none" stroke="#F1C232" strokeWidth={0.45} strokeLinecap="round" d="M6 5.5H32C43.5 5.5 49 13 49 23C49 31 45 37 39.5 40.5L62 61H6Z" />
      </svg>
      <div style={{ position: 'relative' }}>{children}</div>
    </section>
  )
}

/* ---------- controles ---------- */
type BtnKind = 'primary' | 'gold' | 'secondary' | 'ghostdark' | 'link'
const BTN_H = { md: 44, sm: 36, xs: 30 } as const
const BTN_FS = { md: 14, sm: 13, xs: 12 } as const
const BTN_PAD = { md: 18, sm: 14, xs: 11 } as const
const BTN_R = { md: 13, sm: 11, xs: 9 } as const

export function Btn({ children, kind = 'primary', icon, href = '#', size = 'md', onClick, type, style }:
  { children: Kids; kind?: BtnKind; icon?: IconName; href?: string; size?: 'md' | 'sm' | 'xs'; onClick?: () => void; type?: 'button' | 'submit'; style?: React.CSSProperties }) {
  const i = icon ? <Icon n={icon} size={size === 'xs' ? 13 : 15} /> : null
  const base: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: BTN_H[size], padding: `0 ${BTN_PAD[size]}px`, borderRadius: BTN_R[size], fontSize: BTN_FS[size], whiteSpace: 'nowrap', cursor: 'pointer' }
  let s: React.CSSProperties
  if (kind === 'primary') s = { ...base, background: 'var(--btnPrimary)', color: '#FFFFFF', fontWeight: 800 }
  else if (kind === 'gold') s = { ...base, background: 'var(--gold)', color: 'var(--goldInk)', fontWeight: 800, boxShadow: '0 10px 20px -14px rgba(160,120,0,.9)' }
  else if (kind === 'ghostdark') s = { ...base, border: '1px solid rgba(255,255,255,.28)', background: 'rgba(255,255,255,.06)', color: '#FFFFFF', fontWeight: 700 }
  else if (kind === 'link') s = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: 'var(--brand)', whiteSpace: 'nowrap', cursor: 'pointer' }
  else s = { ...base, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700 }
  const content = kind === 'link' ? <>{children}<Icon n="chev" size={14} /></> : <>{i}{children}</>
  if (onClick || type) return <button type={type ?? 'button'} onClick={onClick} style={{ ...s, border: s.border ?? 0, ...style }}>{content}</button>
  const estilo = { ...s, ...style }
  // Link interno (começa com "/") → navegação client do Next (como a sidebar). Externo/# → <a> normal.
  if (href && href.startsWith('/')) return <Link href={href} style={estilo}>{content}</Link>
  return <a href={href} style={estilo}>{content}</a>
}

export function IBtn({ icon, label, size = 40, href, onClick }: { icon: IconName; label: string; size?: number; href?: string; onClick?: () => void }) {
  const s: React.CSSProperties = { width: size, height: size, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }
  if (href) return <a href={href} aria-label={label} title={label} style={s}><Icon n={icon} size={16} /></a>
  return <button type="button" aria-label={label} title={label} onClick={onClick} style={s}><Icon n={icon} size={16} /></button>
}

export function Seg({ items, active = 0, links, counts, style }: { items: string[]; active?: number; links?: string[]; counts?: (number | null)[]; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, padding: 4, borderRadius: 13, background: 'var(--track)', ...style }}>
      {items.map((t, k) => {
        const on = k === active
        const st: React.CSSProperties = on
          ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 2px 8px rgba(30,15,80,.1)', fontWeight: 800 }
          : { background: 'transparent', color: 'var(--muted)', fontWeight: 700 }
        return (
          <a key={k} href={links?.[k] ?? '#'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 10, fontSize: 13, whiteSpace: 'nowrap', ...st }}>
            {t}
            {counts && counts[k] != null ? <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 6px', borderRadius: 99, background: on ? 'var(--chip)' : 'var(--surface)', color: 'var(--brand)' }}>{counts[k]}</span> : null}
          </a>
        )
      })}
    </div>
  )
}

/** Abas de seção: sublinhado dourado na ativa (padrão de abas de linha). */
export function Tabs({ items, active = 0, links, counts }: { items: string[]; active?: number; links?: string[]; counts?: (number | null)[] }) {
  return (
    <nav aria-label="Seções" style={{ display: 'flex', gap: 26, borderBottom: '1px solid var(--line)', overflowX: 'auto' }}>
      {items.map((t, k) => {
        const on = k === active
        return (
          <a key={k} href={links?.[k] ?? '#'} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 4px', fontSize: 14, fontWeight: on ? 800 : 700, color: on ? 'var(--ink)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
            {t}
            {counts && counts[k] != null ? <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)' }}>{counts[k]}</span> : null}
            <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, borderRadius: '3px 3px 0 0', background: on ? 'var(--gold)' : 'transparent' }} />
          </a>
        )
      })}
    </nav>
  )
}

export function Chips({ items, active = 0 }: { items: string[]; active?: number }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {items.map((t, k) => {
        const on = k === active
        return <button key={k} type="button" style={{ height: 34, padding: '0 14px', borderRadius: 99, border: `1px solid ${on ? 'var(--brand)' : 'var(--line)'}`, background: on ? 'var(--brand)' : 'var(--surface)', color: on ? '#FFFFFF' : 'var(--ink)', fontSize: 13, fontWeight: on ? 800 : 700, whiteSpace: 'nowrap', cursor: 'pointer' }}>{t}</button>
      })}
    </div>
  )
}

type TagKind = 'brand' | 'gold' | 'green' | 'red' | 'blue' | 'gray' | 'pink'
const TAG: Record<TagKind, [string, string]> = {
  brand: ['var(--chip)', 'var(--brand)'],
  gold: ['var(--peachBg)', 'var(--accentInk)'],
  green: ['var(--okBg)', 'var(--ok)'],
  red: ['var(--dangerBg)', 'var(--danger)'],
  blue: ['var(--infoBg)', 'var(--info)'],
  gray: ['var(--surface2)', 'var(--muted)'],
  pink: ['var(--pinkBg)', 'var(--pink)'],
}
export function Tag({ children, kind = 'brand', icon }: { children: Kids; kind?: TagKind; icon?: IconName }) {
  const [bg, fg] = TAG[kind]
  return <span style={{ display: 'inline-flex', width: 'fit-content', alignItems: 'center', gap: 5, height: 24, padding: '0 9px', borderRadius: 99, background: bg, color: fg, fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{icon ? <Icon n={icon} size={12} /> : null}{children}</span>
}

export function Bar({ pct, color = 'var(--brand)', h = 8, style }: { pct: number; color?: string; h?: number; style?: React.CSSProperties }) {
  return <div style={{ height: h, borderRadius: 99, background: 'var(--track)', overflow: 'hidden', ...style }}><span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: 99, background: color }} /></div>
}
export const GBAR = 'linear-gradient(90deg,#6449E0,#8F75FF 70%,#F1C232)'

export function MiniBar({ pct, color = 'var(--brand)', w = 90 }: { pct: number; color?: string; w?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: w, height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${pct}%`, background: color, borderRadius: 99 }} /></span>
      <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{pct}%</b>
    </span>
  )
}

export function IconBox({ icon, bg = 'var(--chip)', fg = 'var(--brand)', s = 40 }: { icon: IconName; bg?: string; fg?: string; s?: number }) {
  return <span style={{ width: s, height: s, borderRadius: 12, background: bg, color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon n={icon} size={18} /></span>
}

export function Stat({ value, label, sub, icon }: { value: Kids; label: Kids; sub?: Kids; icon?: IconName }) {
  return (
    <Card pad={16}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {icon ? <IconBox icon={icon} /> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <b style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--ink)' }}>{value}</b>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{label}</span>
          {sub ? <span style={{ fontSize: 11.5, color: 'var(--muted2)' }}>{sub}</span> : null}
        </div>
      </div>
    </Card>
  )
}

export function Avatar({ children, bg = 'var(--gold)', s = 40, fg = 'var(--goldInk)' }: { children: Kids; bg?: string; s?: number; fg?: string }) {
  return <span aria-hidden style={{ width: s, height: s, borderRadius: '50%', background: bg, color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(s * 0.36), fontWeight: 800, flexShrink: 0 }}>{children}</span>
}

export function Field({ placeholder, icon, label, h = 46, type = 'text', style }: { placeholder?: string; icon?: IconName; label?: string; h?: number; type?: string; style?: React.CSSProperties }) {
  const f = (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10, height: h, padding: '0 14px', borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--muted)', ...style }}>
      {icon ? <Icon n={icon} size={16} /> : null}
      <input type={type} placeholder={placeholder} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: 'inherit', fontSize: 14, color: 'var(--ink)' }} />
    </span>
  )
  if (label) return <label style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{label}{f}</label>
  return f
}

export function Textarea({ placeholder, label, h = 110 }: { placeholder?: string; label?: string; h?: number }) {
  const t = <textarea placeholder={placeholder} style={{ width: '100%', height: h, resize: 'vertical', padding: '12px 14px', borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 14, lineHeight: 1.5, boxSizing: 'border-box' }} />
  if (label) return <label style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{label}{t}</label>
  return t
}

/* ---------- mídia / capas ---------- */
const RATIO = { '16:9': '16 / 9', '2:3': '2 / 3', banner: '1280 / 400' } as const
export function Media({ ratio = '16:9', img, fallback, radius = 0, alt = '', style }: { ratio?: keyof typeof RATIO; img?: string | null; fallback?: Kids; radius?: number; alt?: string; style?: React.CSSProperties }) {
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: RATIO[ratio], overflow: 'hidden', borderRadius: radius, background: 'var(--surface2)', ...style }}>
      {img ? <img src={img} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : fallback}
    </div>
  )
}

/** Arte gerada da capa (quando não há imagem): degradê + REVISÃO + selo da linha + sigla. */
export function Cover({ line, sigla, grad = 'linear-gradient(135deg,#2A1E4A,#4A31B8)', big = 26, style }: { line: string; sigla: string; grad?: string; big?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%', background: grad, color: '#FFFFFF', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '14px 16px', ...style }}>
      <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px)', backgroundSize: '18px 18px' }} />
      <RMark w={110} h={107} color="#FFFFFF" style={{ position: 'absolute', right: -16, bottom: -18, opacity: 0.14 }} />
      <span style={{ position: 'relative', fontFamily: 'Montserrat, sans-serif', fontSize: 8.5, fontWeight: 800, letterSpacing: '.32em', whiteSpace: 'nowrap', opacity: 0.85 }}>REVISÃO</span>
      <span style={{ position: 'relative', alignSelf: 'flex-start', marginTop: 7, padding: '3px 8px', borderRadius: 99, background: 'var(--gold)', color: 'var(--goldInk)', fontSize: 9, fontWeight: 800, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>{line}</span>
      <span style={{ position: 'relative', fontFamily: 'Montserrat, sans-serif', fontStyle: 'italic', fontWeight: 800, fontSize: big, lineHeight: 1.02, letterSpacing: '-0.02em', marginTop: 7, textShadow: '0 2px 12px rgba(0,0,0,.25)' }}>{sigla}</span>
    </div>
  )
}

export const GR: Record<string, string> = {
  BA: 'linear-gradient(135deg,#9A3412,#EA580C)',
  RS: 'linear-gradient(135deg,#0F4C5C,#14868F)',
  AL: 'linear-gradient(135deg,#0E5C63,#12808A)',
  RJ: 'linear-gradient(135deg,#1E3A8A,#2F5BD3)',
  MA: 'linear-gradient(135deg,#14532D,#1F7A45)',
  EXT: 'linear-gradient(135deg,#2A1E4A,#4A31B8)',
  ENAP: 'linear-gradient(135deg,#0B5E3A,#1E9A62)',
}

/* ---------- caminho (breadcrumb com voltar) ---------- */
export function Crumbs({ items }: { items: [string, string][] }) {
  const back = items.length > 1 ? items[items.length - 2][1] : '#'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <a href={back} aria-label="Voltar" title="Voltar" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, flexShrink: 0, borderRadius: 11, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}><Icon n="back" size={17} /></a>
      <span aria-hidden style={{ width: 1, height: 22, background: 'var(--line2)' }} />
      <nav aria-label="Caminho" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, flexWrap: 'wrap' }}>
        {items.map(([t, href], k) => {
          const last = k === items.length - 1
          return last
            ? <span key={k} style={{ color: 'var(--ink)', fontWeight: 700 }}>{t}</span>
            : <React.Fragment key={k}><a href={href} style={{ color: 'var(--muted)', fontWeight: 700 }}>{t}</a><Icon n="chev" size={13} style={{ color: 'var(--muted2)' }} /></React.Fragment>
        })}
      </nav>
    </div>
  )
}

/* ---------- faixa de aviso ---------- */
export function Aviso({ children, action, icon = 'flag' }: { children: Kids; action?: Kids; icon?: IconName }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 14, background: 'var(--peachBg)', color: 'var(--accentInk)', flexWrap: 'wrap' }}>
      <Icon n={icon} size={16} />
      <span style={{ flex: 1, minWidth: 180, fontSize: 13, lineHeight: 1.5 }}>{children}</span>
      {action}
    </div>
  )
}
