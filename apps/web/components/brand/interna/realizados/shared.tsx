'use client'

// Átomos compartilhados da área "Simulados realizados" (spec 03 §4): ícones, filtros, tabs,
// pílula de nota (§1.4), segmentos, anel de nota, capas por marca (R contorno / folha / circuito).
// Cada marca compõe sua própria tela — sem "skin" único. Cores de nota via notec (§1.4).

import type { CSSProperties, ReactNode } from 'react'

// ---------------------------------------------------------------- ícones (subset lucide / home_common.I)
const I: Record<string, ReactNode> = {
  clip: (<><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>),
  check: <path d="M20 6 9 17l-5-5" />,
  chart: (<><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></>),
  star: <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />,
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  play: <path d="M7 4v16l13-8z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14M12 5l7 7-7 7" />,
  dl: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M12 12v6M9 15l3 3 3-3" /></>),
  edit: (<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>),
  refresh: (<><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" /><path d="M21 3v5h-5" /></>),
  lock: (<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  cr: <path d="m9 18 6-6-6-6" />,
  chev: <path d="m6 9 6 6 6-6" />,
  search: (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
}

export function Ic({ n, s = 18, c, sw }: { n: string; s?: number; c?: string; sw?: number }) {
  const st: CSSProperties = { width: s, height: s, flexShrink: 0 }
  if (c) st.color = c
  if (sw) (st as Record<string, unknown>).strokeWidth = sw
  return <svg viewBox="0 0 24 24" aria-hidden="true" style={st} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{I[n] ?? null}</svg>
}

// ---------------------------------------------------------------- cores de nota (realizados.notecolor §1.4)
export function notec(v: number): [string, string] {
  if (v < 30) return ['#E5484D', 'rgba(229,72,77,.12)']
  if (v < 60) return ['#D99A1E', 'rgba(217,154,30,.14)']
  return ['#1FA868', 'rgba(31,168,104,.13)']
}
export const fnum = (v: number) => v.toFixed(1).replace('.', ',')

// ---------------------------------------------------------------- tipos de estado comuns
export type Pane = 'main' | 'pers'
export type Filtro = 'all' | 'and' | 'done'

// ---------------------------------------------------------------- abas (Simulados X | Personalizados)
export function PaneTabs({ marca, pt, onPane, nMain, nPers, radius = 12 }: { marca: string; pt: Pane; onPane: (p: Pane) => void; nMain: number; nPers: number; radius?: number }) {
  const cell = (key: Pane, icon: string, label: string, count: number) => {
    const on = pt === key
    return (
      <button type="button" role="tab" aria-selected={on} onClick={() => onPane(key)} className="rlz-tab" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap', height: 42, padding: '0 16px', border: 0, borderRadius: radius, background: on ? 'var(--tOn)' : 'transparent', color: on ? 'var(--tOnInk)' : 'var(--muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        <Ic n={icon} s={16} />{label}
        <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: 'var(--cnt)', color: 'var(--cntInk)' }}>{count}</span>
      </button>
    )
  }
  return (
    <div role="tablist" style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 15, background: 'var(--tBg)' }}>
      {cell('main', 'clip', `Simulados ${marca}`, nMain)}
      {cell('pers', 'plus', 'Personalizados', nPers)}
    </div>
  )
}

// ---------------------------------------------------------------- filtros (Todos/Em andamento/Concluídos)
export function Filtros({ f, onFilter, nAll, nAnd, nDone }: { f: Filtro; onFilter: (x: Filtro) => void; nAll: number; nAnd: number; nDone: number }) {
  const cell = (key: Filtro, label: string, count: number) => {
    const on = f === key
    return (
      <button type="button" onClick={() => onFilter(key)} className="rlz-fbtn" style={{ height: 36, padding: '0 14px', borderRadius: 99, border: '1px solid var(--line)', background: on ? 'var(--fOn)' : 'transparent', color: on ? 'var(--fOnInk)' : 'var(--ink)', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        {label}<span style={{ opacity: 0.7, fontWeight: 600 }}>{count}</span>
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {cell('all', 'Todos', nAll)}
      {cell('and', 'Em andamento', nAnd)}
      {cell('done', 'Concluídos', nDone)}
    </div>
  )
}

// ---------------------------------------------------------------- cabeçalho de seção (ícone chip + título + contagem)
export function SecaoHead({ icon, title, count, color, bg }: { icon: string; title: string; count: number; color: string; bg: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 28, height: 28, borderRadius: 9, background: bg, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic n={icon} s={15} /></span>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--head, var(--ink))' }}>{title}</h3>
      <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{count}</span>
    </div>
  )
}

// ---------------------------------------------------------------- pílula de nota (§1.4)
export function NotaPill({ v, large = false }: { v: number; large?: boolean }) {
  const [c, bg] = notec(v)
  return (
    <span title="Melhor nota" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', height: 28, padding: '0 10px', borderRadius: 9, background: bg, color: c, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
      Nota<b style={{ fontSize: large ? 15 : 14 }}>{fnum(v)}</b>
    </span>
  )
}

// ---------------------------------------------------------------- botão de ação em ícone (Ver correção/Refazer/Baixar)
export function IBtn({ icon, label, onClick }: { icon: string; label: string; onClick?: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="rlz-ibtn" style={{ width: 30, height: 30, borderRadius: 10, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      <Ic n={icon} s={15} />
    </button>
  )
}

// ---------------------------------------------------------------- segmentos (barra reta MEQ/VND)
export function Segs({ n, lit, h = 7, on = 'var(--brand)', off = 'var(--track)', gap = 3, rad = 3 }: { n: number; lit: number; h?: number; on?: string; off?: string; gap?: number; rad?: number }) {
  return (
    <div style={{ display: 'flex', gap }}>
      {Array.from({ length: n }).map((_, k) => (
        <span key={k} className={k < lit ? 'rlz-sg' : ''} style={{ flex: 1, height: h, borderRadius: rad, background: k < lit ? on : off }} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- barra contínua gradiente (Revisão)
export function BarRev({ pct, h = 6 }: { pct: number; h?: number }) {
  return (
    <div style={{ height: h, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
      <span className="rlz-bar" style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#6449E0,#F1C232)' }} />
    </div>
  )
}

// ---------------------------------------------------------------- anel de nota (VND concluído)
export function NotaRing({ v, size = 54 }: { v: number; size?: number }) {
  const r = (size - 8) / 2, C = 2 * Math.PI * r, [c] = notec(v)
  return (
    <span style={{ position: 'relative', width: size, height: size, flexShrink: 0, display: 'inline-block', borderRadius: '50%', background: 'rgba(4,26,16,.75)', boxShadow: '0 6px 16px -6px rgba(0,0,0,.6)' }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth={4} />
        <circle className="rlz-ring" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth={4} strokeLinecap="round" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - v / 100)).toFixed(1)} style={{ ['--c' as string]: C.toFixed(1) } as CSSProperties} />
      </svg>
      <b style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#FFF' }}>{Math.round(v)}</b>
    </span>
  )
}

// ---------------------------------------------------------------- CAPAS por marca (decorativas, aria-hidden)
// Revisão: marca R em contorno + grade (porte do mockup).
export function CoverRev({ titulo, sub, grad, big = 24, monteItalic = true, img }: { titulo: string; sub: string; grad: string; big?: number; monteItalic?: boolean; img?: string | null }) {
  // Com IMAGEM real (capa/ticket do simulado): a foto preenche a capa (object-cover) e NÃO há texto nem
  // degradê sobreposto — a arte da imagem já traz o título. Sem imagem: gradiente + textura + glifo + texto.
  return (
    <div className="rlz-cov" style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%', background: grad, color: '#FFF', display: 'flex', flexDirection: 'column', justifyContent: img ? 'flex-end' : 'center', padding: img ? 0 : '12px 14px' }}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <>
          <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px)', backgroundSize: '18px 18px', pointerEvents: 'none' }} />
          <svg viewBox="0 0 68 66" aria-hidden style={{ position: 'absolute', right: -14, bottom: -16, width: 92, height: 89, opacity: 0.14, pointerEvents: 'none' }}><path fill="#FFFFFF" fillRule="evenodd" d="M6 5.5H32C43.5 5.5 49 13 49 23C49 31 45 37 39.5 40.5L62 61H6Z M9.2 9.2H19.2V57.6H9.2Z" /></svg>
          <span style={{ position: 'relative', fontFamily: 'Montserrat,sans-serif', fontSize: 8, fontWeight: 800, letterSpacing: '.5em', opacity: 0.85 }}>R E V I S Ã O</span>
          <span style={{ position: 'relative', fontSize: 8.5, fontWeight: 800, letterSpacing: '.14em', opacity: 0.85, marginTop: 4 }}>{sub}</span>
          <span style={{ position: 'relative', fontFamily: 'Montserrat,sans-serif', fontStyle: monteItalic ? 'italic' : 'normal', fontWeight: 800, fontSize: big, lineHeight: 1, letterSpacing: '-0.02em', marginTop: 4, textShadow: '0 2px 12px rgba(0,0,0,.45)' }}>{titulo}</span>
        </>
      )}
    </div>
  )
}

// VND: capa verde + folha (leaf) decorativa + traço dourado.
export function CoverVnd({ titulo, sub, grad, big = 22, showKicker = false, img }: { titulo: string; sub: string; grad: string; big?: number; showKicker?: boolean; img?: string | null }) {
  return (
    <div className="rlz-cov" style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%', background: grad, color: '#FFF', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: img ? 0 : '12px 14px' }}>
      {img ? (
        // COM IMAGEM: só a foto, sem texto nem degradê (a arte já tem o título).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <>
          <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(185,245,212,.22) 1px,transparent 1.6px)', backgroundSize: '14px 14px', pointerEvents: 'none' }} />
          <svg viewBox="0 0 32 32" aria-hidden style={{ position: 'absolute', right: -18, top: -14, width: 110, height: 110, opacity: 0.16, pointerEvents: 'none' }}><path fill="#B9F5D4" d="M1 5.9 11.5 5.77Q12.2 5.76 12.53 6.13L21.21 15.98Q21.47 16.25 21.57 15.86L21.6 8.1C21.6 7.05 20.81 6.3 19.76 5.88L30.57 5.9Q31 5.91 30.74 6.33L23.18 14.49C22.26 15.55 21.8 16.65 21.73 18.23L21.67 25.45Q21.6 26.24 20.95 25.96L6.03 8.31C4.78 6.96 3.14 6.19 1 5.9Z" /></svg>
          {showKicker ? <span style={{ position: 'absolute', left: 14, top: 12, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8.5, fontWeight: 800, letterSpacing: '.2em', color: '#F1D48A' }}>SIMULA VND</span> : null}
          <span style={{ position: 'relative', fontSize: 8.5, fontWeight: 800, letterSpacing: '.16em', color: '#CFE3D7' }}>{sub}</span>
          <span style={{ position: 'relative', fontWeight: 800, fontSize: big, lineHeight: 1.02, letterSpacing: '-0.04em' }}>{titulo}</span>
          <span aria-hidden style={{ position: 'relative', display: 'block', width: 34, height: 3, borderRadius: 3, background: '#D8B45A', marginTop: 6 }} />
        </>
      )}
    </div>
  )
}

// MEQ: capa navy + "circuito" simplificado (3 traços) + 3 barrinhas ciano (porte de perfil-meq Cover).
export function CoverMeq({ titulo, grad, big = 12, img }: { titulo: string; grad: string; big?: number; img?: string | null }) {
  return (
    <div className="rlz-cov" style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%', background: grad, color: '#FFF', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: img ? 0 : '10px 12px' }}>
      {img ? (
        // COM IMAGEM: só a foto, sem texto nem degradê (a arte já tem o título).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <>
          <svg viewBox="0 0 160 100" aria-hidden preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <path d="M-5 20 H40 V48 H90 V14 H165" fill="none" stroke="rgba(94,206,240,.3)" strokeWidth={1.4} />
            <path d="M-5 64 H26 V36 H70 V72 H165" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={1.2} />
            {[[40, 20], [90, 48], [26, 64], [70, 36]].map(([x, y], i) => <rect key={i} x={x - 3} y={y - 3} width={6} height={6} rx={1.5} fill="#5ECEF0" opacity={0.7} />)}
          </svg>
          <span aria-hidden style={{ position: 'absolute', left: 12, top: 10, display: 'flex', gap: 2 }}>{[[5, 0.5], [8, 0.75], [11, 1]].map(([h, o], i) => <span key={i} style={{ display: 'block', width: 4, height: h, borderRadius: 1, background: '#5ECEF0', opacity: o, alignSelf: 'flex-end' }} />)}</span>
          <span style={{ position: 'relative', fontWeight: 700, fontSize: big, letterSpacing: '-0.04em', lineHeight: 1.05 }}>{titulo}</span>
        </>
      )}
    </div>
  )
}
