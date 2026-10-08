'use client'

// Átomos compartilhados do Perfil (spec 05 §0): ícones, card/head/bar/btn/pill/iconbtn, donut,
// bars/line/spark/radar/step/gauge SVG, notecolor/fnum. Portados de kit.py / home_common.py.
// Cada marca compõe sua própria tela (perfil-*.tsx) usando estes átomos — NÃO há "skin" único.

import type { CSSProperties, ReactNode } from 'react'
import type { Brand } from '../interna-tokens'

// ---------------------------------------------------------------- ícones (subset de home_common.I)
const I: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  clip: (<><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>),
  books: <path d="M4 4v16M8 4v16M12 4l5 16M16 4h4v16h-4" />,
  gavel: (<><path d="m14 13-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10" /><path d="m16 16 6-6M8 8l6-6M9 7l8 8M21 11l-8-8" /></>),
  cal: (<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  bulb: (<><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" /></>),
  book: <path d="M2 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v14a2 2 0 0 1 2-2h8z" />,
  trophy: (<><path d="M6 9H4a2 2 0 0 1 0-4h2M18 9h2a2 2 0 0 0 0-4h-2" /><path d="M6 3h12v6a6 6 0 0 1-12 0z" /><path d="M12 15v4M8 21h8" /></>),
  flame: <path d="M12 22c4 0 7-2.7 7-6.6 0-3.4-2.3-5.6-4-7.4-.4 2-1.4 3-2.5 3.4C13 8 12 4.6 9 2c.3 3.6-4 6.4-4 11.4C5 19.3 8 22 12 22z" />,
  bolt: <path d="M13 2 3 14h9l-1 8 10-12h-9z" />,
  target: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>),
  gift: (<><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  dl: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M12 12v6M9 15l3 3 3-3" /></>),
  play: <path d="M7 4v16l13-8z" />,
  cl: <path d="m15 18-6-6 6-6" />,
  cr: <path d="m9 18 6-6-6-6" />,
  search: (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
  crown: <path d="m2 7 5 5 5-8 5 8 5-5-2 12H4z" />,
  medal: (<><circle cx="12" cy="15" r="6" /><path d="M8.2 10.4 5 3h4l3 6 3-6h4l-3.2 7.4" /></>),
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  check: <path d="M20 6 9 17l-5-5" />,
  star: <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />,
  chart: (<><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></>),
  grid: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  arrow: <path d="M5 12h14M12 5l7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  cap: (<><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></>),
  diamond: (<><path d="M6 3h12l4 6-10 12L2 9z" /><path d="M2 9h20M12 21 8 9l4-6 4 6z" /></>),
  gem: <path d="m12 2 8 5v10l-8 5-8-5V7z" />,
  layers: (<><path d="m12 2 10 5-10 5L2 7z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></>),
  lock: (<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  edit: (<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>),
  refresh: (<><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" /><path d="M21 3v5h-5" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2 20a7 7 0 0 1 14 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-4-6.3" /></>),
  trend: (<><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>),
  sliders: (<><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  flag: <path d="M4 22V4M4 4h12l-2 4 2 4H4" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
}

export function Ic({ n, s = 18, c, sw }: { n: string; s?: number; c?: string; sw?: number }) {
  const st: CSSProperties = { width: s, height: s }
  if (c) st.color = c
  if (sw) (st as Record<string, unknown>).strokeWidth = sw
  return <svg viewBox="0 0 24 24" aria-hidden="true" style={st} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{I[n] ?? null}</svg>
}

// ---------------------------------------------------------------- cores de nota (realizados.notecolor)
export function notec(v: number): [string, string] {
  if (v < 30) return ['#E5484D', 'rgba(229,72,77,.12)']
  if (v < 60) return ['#D99A1E', 'rgba(217,154,30,.14)']
  return ['#1FA868', 'rgba(31,168,104,.13)']
}
export const fnum = (v: number) => v.toFixed(1).replace('.', ',')

// ---------------------------------------------------------------- adaptador de marca (kit.Brand)
export class BK {
  k: Brand
  constructor(k: Brand) { this.k = k }
  get isMeq() { return this.k === 'meq' }
  get isVnd() { return this.k === 'vnd' }
  get isRev() { return this.k === 'revisao' }
  get acc() { return this.isMeq ? 'var(--brand2)' : 'var(--brand)' }
  get cardRad() { return this.isMeq ? 14 : this.isVnd ? 24 : 20 }

  card(inner: ReactNode, pad = 20, extra: CSSProperties = {}, key?: string | number) {
    return (
      <div key={key} className="card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: this.cardRad, padding: pad, boxShadow: this.isMeq ? 'var(--shadow, 0 10px 30px -18px rgba(0,0,0,.25))' : undefined, ...extra }}>
        {inner}
      </div>
    )
  }

  // título de card (ícone solto roxo Rev / quadrado chip VND / "sinal" MEQ)
  head(icon: string, title: string, right?: ReactNode, sub?: string) {
    let mark: ReactNode
    if (this.isMeq) {
      mark = (
        <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
          {[[6, 0.45], [10, 0.7], [14, 1]].map(([h, o], i) => (
            <span key={i} style={{ display: 'block', width: 3, height: h, borderRadius: 1, background: 'var(--brand2)', opacity: o }} />
          ))}
        </span>
      )
    } else if (this.isVnd) {
      mark = <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic n={icon} s={16} /></span>
    } else {
      mark = <Ic n={icon} s={18} c="var(--brand)" />
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {mark}
          <div>
            <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: this.isMeq ? 700 : 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{title}</h3>
            {sub ? <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginTop: 2 }}>{sub}</span> : null}
          </div>
        </div>
        {right}
      </div>
    )
  }

  // barra de progresso: Rev pílula gradiente / VND 20 segmentos / MEQ 20 segmentos
  bar(p: number, color?: string, h = 8) {
    if (this.isMeq) return <Segs n={20} lit={Math.round(p / 5)} h={h} on={color || 'var(--brand2)'} />
    if (this.isVnd) {
      return (
        <div style={{ display: 'flex', gap: 3 }}>
          {Array.from({ length: 20 }).map((_, k) => (
            <span key={k} style={{ flex: 1, height: h, borderRadius: 3, background: k < Math.round(p / 5) ? (color || 'var(--brand)') : 'var(--track)' }} />
          ))}
        </div>
      )
    }
    const grad = 'linear-gradient(90deg,#6449E0,#8F75FF 70%,#F1C232)'
    return (
      <div style={{ height: h, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
        <span className="pbar" style={{ display: 'block', width: `${p}%`, height: '100%', borderRadius: 99, background: color || grad }} />
      </div>
    )
  }

  btn(text: string, icon: string | null, kind: 'primary' | 'accent' | 'ghost', h = 40, full = false) {
    const r = this.isRev ? 12 : this.isVnd ? 13 : 10
    const ico = icon ? <Ic n={icon} s={14} /> : null
    const base: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: h, padding: '0 16px', borderRadius: r, fontSize: 13.5, fontWeight: this.isMeq ? 700 : 800, whiteSpace: 'nowrap', cursor: 'default', ...(full ? { width: '100%' } : {}) }
    if (kind === 'primary') {
      return <span style={{ ...base, color: '#FFF', background: this.acc }}>{ico}{text}</span>
    }
    if (kind === 'accent') {
      if (this.isVnd) return <span style={{ ...base, color: '#2A1F02', background: 'linear-gradient(180deg,#F1D48A,#D8B45A)' }}>{ico}{text}</span>
      if (this.isRev) return <span style={{ ...base, color: '#2A1A55', background: '#F1C232' }}>{ico}{text}</span>
      return <span style={{ ...base, color: 'var(--surface)', background: 'var(--ink)', fontWeight: 700 }}>{ico}{text}</span>
    }
    return <span style={{ ...base, padding: '0 14px', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 13, fontWeight: 700 }}>{ico}{text}</span>
  }

  iconbtn(icon: string, label: string, size = 34) {
    const r = this.isRev ? 10 : this.isVnd ? 12 : 9
    return <span aria-label={label} title={label} style={{ width: size, height: size, flexShrink: 0, borderRadius: r, border: '1px solid var(--line)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic n={icon} s={15} /></span>
  }

  pill(text: string, color: string, bg: string, icon?: string) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 9px', borderRadius: this.isMeq ? 6 : 99, background: bg, color, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{icon ? <Ic n={icon} s={12} /> : null}{text}</span>
  }
}

// ---------------------------------------------------------------- segmentos (home_meq.segs)
export function Segs({ n, lit, h = 8, on = 'var(--brand2)', off = 'var(--track)' }: { n: number; lit: number; h?: number; on?: string; off?: string }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: n }).map((_, k) => (
        <span key={k} className={k < lit ? 'pseg' : ''} style={{ flex: 1, height: h, borderRadius: 2, background: k < lit ? on : off }} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- tabs (kit.segbtns)
export interface TabDef { key: string; label: string; icon: string }
export function Tabs({ bk, tabs, active, onPick, mobile }: { bk: BK; tabs: TabDef[]; active: string; onPick: (k: string) => void; mobile: boolean }) {
  const r = bk.isMeq ? 8 : 11
  return (
    <div role="tablist" className={mobile ? 'hs' : ''} style={{ display: mobile ? 'grid' : 'inline-flex', gridTemplateColumns: mobile ? `repeat(${tabs.length},1fr)` : undefined, width: mobile ? '100%' : undefined, gap: 3, padding: 4, borderRadius: bk.isMeq ? 11 : 15, background: 'var(--tBg)', overflowX: mobile ? 'auto' : undefined }}>
      {tabs.map((t) => {
        const on = active === t.key
        return (
          <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => onPick(t.key)} className="ptab" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, whiteSpace: 'nowrap', height: mobile ? 38 : 40, padding: mobile ? '0 10px' : '0 14px', border: 0, borderRadius: r, background: on ? 'var(--tOn)' : 'transparent', color: on ? 'var(--tOnInk)' : 'var(--muted)', fontSize: mobile ? 12.5 : 13.5, fontWeight: 700, cursor: 'pointer' }}>
            {!mobile ? <Ic n={t.icon} s={15} /> : null}{t.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- charts (kit)
export function Donut({ parts, size = 150, sw = 20 }: { parts: [number, string][]; size?: number; sw?: number }) {
  const r = (size - sw) / 2
  const C = 2 * Math.PI * r
  let off = 0
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, transform: 'rotate(-90deg)' }}>
      {parts.map(([v, c], i) => {
        const L = C * v
        const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth={sw} strokeDasharray={`${L.toFixed(1)} ${(C - L).toFixed(1)}`} strokeDashoffset={(-off).toFixed(1)} />
        off += L
        return el
      })}
    </svg>
  )
}

export function Spark({ vals, color, w = 110, h = 34 }: { vals: number[]; color: string; w?: number; h?: number }) {
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = (mx - mn) || 1
  const pts = vals.map((v, i) => [i * w / (vals.length - 1), h - 3 - (v - mn) / rng * (h - 8)])
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h, display: 'block', overflow: 'visible', flexShrink: 0 }}>
      <polyline className="pln" points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0].toFixed(1)} cy={pts[pts.length - 1][1].toFixed(1)} r={3} fill={color} />
    </svg>
  )
}

// barras SVG com grow (kit.bars_svg)
export function BarsSvg({ vals, labels, w = 900, h = 200, color = 'var(--brand)', rad = 6, showVals = true }: { vals: number[]; labels: string[]; w?: number; h?: number; color?: string; rad?: number; showVals?: boolean }) {
  const n = vals.length, mx = Math.max(...vals, 1)
  // Modelo de CÉLULAS IGUAIS (w/n), barra centrada na célula — IDÊNTICO aos rótulos HTML (flex:1),
  // então barra, valor e dia ficam SEMPRE alinhados (independente do stretch do preserveAspectRatio).
  const cell = w / n
  const bw = Math.max(4, Math.min(cell * 0.6, 46))
  // Headroom no topo: a barra mais alta vai só até HEAD, deixando espaço p/ o VALOR (nota) acima
  // dela sempre aparecer — antes o número da barra mais alta era cortado pelo topo do container.
  const HEAD = 22
  const plotH = Math.max(10, h - HEAD)
  // Só as BARRAS ficam no SVG escalado (preserveAspectRatio:none). Os RÓTULOS/valores vão em HTML —
  // texto dentro de SVG com escala não-uniforme fica ESTICADO (bug da aba Estatísticas).
  const centerPct = (i: number) => (((i + 0.5) * cell) / w) * 100
  return (
    <div style={{ width: '100%' }}>
      <div style={{ position: 'relative', width: '100%', height: h }}>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block', overflow: 'visible' }}>
          {[0, 1, 2, 3, 4].map((k) => { const y = h - plotH * k / 4; return <line key={k} x1={0} x2={w} y1={y.toFixed(1)} y2={y.toFixed(1)} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" /> })}
          {vals.map((v, i) => {
            const x = i * cell + (cell - bw) / 2, bh = Math.max(3, plotH * v / mx), y = h - bh
            return <rect key={i} className="pgrow" x={x.toFixed(1)} y={y.toFixed(1)} width={bw.toFixed(1)} height={bh.toFixed(1)} rx={rad} fill={color} style={{ animationDelay: `${(i * 0.02).toFixed(2)}s`, transformOrigin: `${(x + bw / 2).toFixed(1)}px ${h}px` }} />
          })}
        </svg>
        {showVals && (
          <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {vals.map((v, i) => {
              const bh = Math.max(3, plotH * v / mx), topPct = ((h - bh) / h) * 100
              return <span key={i} style={{ position: 'absolute', left: `${centerPct(i)}%`, top: `${topPct}%`, transform: 'translate(-50%,-118%)', fontSize: 10, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{String(v).replace('.', ',')}</span>
            })}
          </div>
        )}
      </div>
      {labels.length > 0 && (
        <div style={{ display: 'flex', marginTop: 4 }}>
          {labels.map((l, i) => <span key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l}</span>)}
        </div>
      )}
    </div>
  )
}

export function LineSvg({ vals, w = 900, h = 180, color = 'var(--brand)', fill = 'var(--chip)' }: { vals: number[]; w?: number; h?: number; color?: string; fill?: string }) {
  const n = vals.length, mx = Math.max(...vals, 1)
  const pts = vals.map((v, i) => [i * w / (n - 1), h - h * v / mx * 0.92])
  const d = 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')
  const area = d + ` L${w} ${h} L0 ${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block', overflow: 'visible' }}>
      {[0, 1, 2, 3, 4].map((k) => <line key={k} x1={0} x2={w} y1={(h - h * k / 4).toFixed(1)} y2={(h - h * k / 4).toFixed(1)} stroke="var(--line)" />)}
      <path d={area} fill={fill} opacity={0.8} />
      <path className="pln" d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {pts.map(([x, y], i) => <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={3.5} fill="var(--surface)" stroke={color} strokeWidth={2} />)}
    </svg>
  )
}

export function delta(txt: string, good = true) {
  const col = good ? '#1FA868' : '#E5484D'
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11.5, fontWeight: 800, color: col, whiteSpace: 'nowrap' }}><Ic n={good ? 'up' : 'down'} s={12} sw={3} />{txt}</span>
}

// toggle (switch de preferências)
export function Toggle({ on, acc }: { on: boolean; acc: string }) {
  return (
    <span style={{ width: 36, height: 21, borderRadius: 99, background: on ? acc : 'var(--track)', position: 'relative', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 2.5, left: on ? 17.5 : 2.5, width: 16, height: 16, borderRadius: '50%', background: '#FFF', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
    </span>
  )
}
