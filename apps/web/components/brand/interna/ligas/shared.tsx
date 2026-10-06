'use client'

// Átomos compartilhados da área "Ligas" (spec 04 §4): ícones, divtrack (trilha de divisões bronze→topo),
// pódio (SÓ INICIAIS — privacidade §0), barras "Sua semana" (rótulos em HTML, nunca <text> em SVG escalado),
// tiles de stat, rodapé de privacidade e placeholder do slot {ranking}. Cada marca compõe sua própria tela.
// Cores das divisões vêm do design (fixas); o resto via tokens (--brand/--surface/--line/…).

import type { CSSProperties, ReactNode } from 'react'
import type { LigaData, LigaTier, LigaPeer } from './data'
import { avatarPadraoDe } from '@/lib/aluno/avatar-padrao'

// ---------------------------------------------------------------- ícones (subset lucide)
const I: Record<string, ReactNode> = {
  trophy: (<><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>),
  users: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  flame: (<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />),
  up: <path d="M12 19V5M5 12l7-7 7 7" />,
  crown: <path d="M2 18h20M4 18 2 8l5.5 4L12 5l4.5 7L22 8l-2 10" />,
  lock: (<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  check: <path d="M20 6 9 17l-5-5" />,
  bolt: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />,
  star: <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />,
}

export function Ic({ n, s = 18, c, sw }: { n: string; s?: number; c?: string; sw?: number }) {
  const st: CSSProperties = { width: s, height: s, flexShrink: 0 }
  if (c) st.color = c
  if (sw) (st as Record<string, unknown>).strokeWidth = sw
  return <svg viewBox="0 0 24 24" aria-hidden="true" style={st} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{I[n] ?? null}</svg>
}

export const fmtXp = (n: number) => n.toLocaleString('pt-BR')

// ---------------------------------------------------------------- tile de stat do hero (valor + legenda)
export function StatTile({ v, l, inkV = '#FFF', inkL = 'rgba(255,255,255,.72)', bg = 'rgba(255,255,255,.08)', bd }: { v: ReactNode; l: string; inkV?: string; inkL?: string; bg?: string; bd?: string }) {
  return (
    <div style={{ padding: '10px 14px', borderRadius: 14, background: bg, border: bd ? `1px solid ${bd}` : undefined, minWidth: 0 }}>
      <b style={{ display: 'block', fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em', color: inkV, lineHeight: 1.1 }}>{v}</b>
      <span style={{ fontSize: 11, color: inkL, fontWeight: 600 }}>{l}</span>
    </div>
  )
}

// ---------------------------------------------------------------- selo/escudo da liga (ícone troféu na cor da liga)
export function Escudo({ cor, size = 68, bg = 'rgba(255,255,255,.12)' }: { cor?: string | null; size?: number; bg?: string }) {
  return (
    <span style={{ width: size, height: size, borderRadius: size * 0.28, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: bg, border: `1px solid ${cor ?? '#E8A93A'}55`, boxShadow: `inset 0 0 0 2px ${cor ?? '#E8A93A'}33` }}>
      <Ic n="trophy" s={Math.round(size * 0.52)} c={cor ?? '#E8A93A'} />
    </span>
  )
}

// ---------------------------------------------------------------- DIVTRACK — trilha de progressão das divisões
// tiers passada = 100% preenchido; atual = destacado ("VOCÊ"); futuros = apagados + borda tracejada.
// "Rumo à {proxima}" com barra (xpTotal rumo ao próximo xpMin). Rótulos SEMPRE em HTML.
export function DivTrack({ tiers, xpTotal, proximaNome, faltam, dark, onDark = false }: { tiers: LigaTier[]; xpTotal: number; proximaNome: string | null; faltam: number; dark: boolean; onDark?: boolean }) {
  const idxAtual = Math.max(0, tiers.findIndex((t) => t.atual))
  const atual = tiers[idxAtual]
  const prox = tiers[idxAtual + 1]
  // progresso rumo ao próximo tier (dentro da faixa atual)
  const base = atual?.xpMin ?? 0
  const alvo = prox?.xpMin ?? base + 1
  const pct = prox ? Math.min(100, Math.max(0, Math.round(((xpTotal - base) / (alvo - base)) * 100))) : 100
  const inkMuted = onDark ? 'rgba(255,255,255,.6)' : 'var(--muted)'
  const inkHead = onDark ? '#FFF' : 'var(--ink)'
  const trackBg = onDark ? 'rgba(255,255,255,.14)' : 'var(--track)'
  const futureBd = onDark ? 'rgba(255,255,255,.22)' : 'var(--line2)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* nós das divisões */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
        {tiers.map((t, i) => {
          const futuro = !t.passada && !t.atual
          const nodeSize = t.atual ? 46 : 38
          return (
            <div key={t.nome} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0, position: 'relative' }}>
              {/* conector até o próximo */}
              {i < tiers.length - 1 ? (
                <span aria-hidden style={{ position: 'absolute', top: nodeSize / 2 - 1.5, left: '50%', width: '100%', height: 3, borderRadius: 3, background: tiers[i + 1].passada || tiers[i + 1].atual ? (t.cor ?? 'var(--brand)') : trackBg }} />
              ) : null}
              <span
                style={{
                  position: 'relative', width: nodeSize, height: nodeSize, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  background: futuro ? (onDark ? 'rgba(255,255,255,.06)' : 'var(--surface2)') : (t.cor ?? 'var(--brand)'),
                  color: futuro ? inkMuted : '#FFF',
                  border: futuro ? `1.5px dashed ${futureBd}` : `2px solid ${onDark ? 'rgba(255,255,255,.5)' : '#FFF'}`,
                  boxShadow: t.atual ? `0 0 0 6px ${(t.cor ?? '#E8A93A')}33` : 'none',
                }}
              >
                {t.passada ? <Ic n="check" s={nodeSize * 0.42} /> : futuro ? <Ic n="lock" s={nodeSize * 0.4} /> : <Ic n="trophy" s={nodeSize * 0.46} />}
              </span>
              <b style={{ fontSize: 11, fontWeight: 800, letterSpacing: '-0.01em', color: t.atual ? inkHead : inkMuted, textAlign: 'center', whiteSpace: 'nowrap' }}>{t.nome}</b>
              {t.atual ? <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', color: t.cor ?? 'var(--brand)' }}>VOCÊ</span> : <span style={{ fontSize: 9.5, color: inkMuted }}>{fmtXp(t.xpMin)}</span>}
            </div>
          )
        })}
      </div>
      {/* barra "Rumo à {proxima}" */}
      {proximaNome ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, fontWeight: 700 }}>
            <span style={{ color: inkMuted }}>Rumo à {proximaNome}</span>
            <span style={{ color: inkHead }}>faltam {fmtXp(faltam)} XP</span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: trackBg, overflow: 'hidden' }}>
            <span className="lg-bar" style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#B9773F,#9AA5B1,#E8A93A)' }} />
          </div>
        </div>
      ) : (
        <span style={{ fontSize: 12, fontWeight: 700, color: inkHead }}>Divisão máxima alcançada</span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- PÓDIO (top 3) — SÓ INICIAIS (§0)
// central (1º) maior; alturas 2º/1º/3º = 86/112/66. Cores prata/ouro/bronze.
const MEDAL = { 1: '#E8A93A', 2: '#9AA5B1', 3: '#B9773F' } as const
export function Podio({ podio, dark }: { podio: LigaPeer[]; dark: boolean }) {
  const first = podio.find((p) => p.pos === 1)
  const second = podio.find((p) => p.pos === 2)
  const third = podio.find((p) => p.pos === 3)
  const ordered = [second, first, third].filter(Boolean) as LigaPeer[]
  const H: Record<number, number> = { 1: 112, 2: 86, 3: 66 }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, alignItems: 'end' }}>
      {ordered.map((p) => {
        const cor = MEDAL[p.pos as 1 | 2 | 3]
        const av = p.pos === 1 ? 72 : 58 // 1º um pouco maior; 2º e 3º um pouco menores
        return (
          <div key={p.pos} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {p.pos === 1 ? <Ic n="crown" s={20} c={cor} /> : null}
            {/* avatar PADRÃO (capivara) no círculo da medalha — cor de fundo padronizada (cor da medalha). */}
            <span style={{ width: av, height: av, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `${cor}22`, border: `2px solid ${cor}`, color: cor, fontSize: p.pos === 1 ? 15 : 13, fontWeight: 800, letterSpacing: '-0.02em' }}>
              {/* imagem como estava (contain, foco embaixo); o tamanho varia só pelo círculo (av). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarPadraoDe(p.iniciais + String(p.pos))} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center 82%' }} />
            </span>
            <b style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>{fmtXp(p.xp)} XP</b>
            <div style={{ width: '100%', height: H[p.pos], borderRadius: '10px 10px 0 0', background: `linear-gradient(180deg,${cor},${cor}66)`, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 8, color: dark ? '#10131A' : '#2A1A10', fontSize: 22, fontWeight: 900 }}>{p.pos}</div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- "Sua semana" — barras XP/dia (rótulos HTML)
// NUNCA usar <text> em <svg preserveAspectRatio="none">. Barras são <div>; o rótulo (dia/valor) é HTML.
export function SemanaBars({ semana, cor = 'var(--brand)' }: { semana: { dia: string; xp: number }[]; cor?: string }) {
  const max = Math.max(1, ...semana.map((d) => d.xp))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${semana.length},1fr)`, gap: 8, alignItems: 'end', height: 128 }}>
      {semana.map((d) => {
        const h = Math.max(4, Math.round((d.xp / max) * 92))
        return (
          <div key={d.dia} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, height: '100%', justifyContent: 'flex-end', minWidth: 0 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink)' }}>{d.xp}</span>
            <div className="lg-grow" style={{ width: '100%', maxWidth: 26, height: h, borderRadius: 7, background: d.xp === 0 ? 'var(--track)' : cor, opacity: d.xp === 0 ? 0.6 : 1 }} />
            <span style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>{d.dia}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- abas (Minha liga | Ranking geral)
export type LigaTab = 'liga' | 'geral'
export function LigaTabs({ tab, onTab, onCell = 'var(--brand)', onInk = '#FFF', bg = 'var(--surface2)', radius = 12 }: { tab: LigaTab; onTab: (t: LigaTab) => void; onCell?: string; onInk?: string; bg?: string; radius?: number }) {
  const cell = (key: LigaTab, icon: string, label: string) => {
    const on = tab === key
    return (
      <button type="button" role="tab" aria-selected={on} onClick={() => onTab(key)} className="lg-tab" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap', height: 42, padding: '0 18px', border: 0, borderRadius: radius, background: on ? onCell : 'transparent', color: on ? onInk : 'var(--muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        <Ic n={icon} s={16} />{label}
      </button>
    )
  }
  return (
    <div role="tablist" style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: radius + 3, background: bg }}>
      {cell('liga', 'trophy', 'Minha liga')}
      {cell('geral', 'users', 'Ranking geral')}
    </div>
  )
}

// ---------------------------------------------------------------- rodapé de privacidade (§0 — obrigatório)
export function PrivacyNote({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, border: '1px dashed var(--line2)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600 }}>
      <Ic n="lock" s={14} />{text}
    </div>
  )
}

// ---------------------------------------------------------------- SLOT da classificação completa
// Renderiza o componente funcional real (lista da liga). Sem ele → placeholder (preview).
export function RankingSlot({ ranking }: { ranking?: ReactNode }) {
  // O ranking real (componente antigo shadcn) usa classes `bg-muted`/`text-muted-foreground` etc. O root
  // interna REDEFINE `--muted` (cor secundária da marca) → `bg-muted` ficava cinza-lilás e quebrava o dark.
  // Restauramos `--muted` ao valor shadcn (claro/escuro) só dentro deste slot, sem afetar o visual interna.
  if (ranking) return (
    <div className="ilg-rankreset">
      <style>{'.ilg-rankreset{--muted:oklch(0.97 0.004 300)}.dark .ilg-rankreset{--muted:oklch(0.27 0.015 300)}'}</style>
      {ranking}
    </div>
  )
  return (
    <div style={{ padding: '28px 20px', borderRadius: 'var(--r)', border: '1px dashed var(--line2)', background: 'var(--surface)', color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>
      <Ic n="users" s={22} c="var(--muted)" />
      <p style={{ margin: '8px 0 0', fontWeight: 700, color: 'var(--ink)' }}>Classificação completa</p>
      <p style={{ margin: '4px 0 0' }}>A lista da liga aparece aqui (componente de ranking real).</p>
    </div>
  )
}

// ---------------------------------------------------------------- card genérico (seção)
export function Painel({ title, sub, children, pad = 18 }: { title?: string; sub?: string; children: ReactNode; pad?: number }) {
  return (
    <section style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: pad, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {title ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{title}</h3>
          {sub ? <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{sub}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

// CSS base reutilizável (prefixo por marca injeta o resto). reduced-motion desliga animações.
export const LIGA_BASE_CSS = `
.lg-pv{animation:lgpv .45s cubic-bezier(.22,1,.36,1) both}@keyframes lgpv{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.lg-tab{transition:background .25s,color .25s}
.lg-bar{transform-origin:0 50%;animation:lggrow 1.1s cubic-bezier(.2,.8,.2,1) .3s both}@keyframes lggrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.lg-grow{transform-origin:50% 100%;animation:lggy .9s cubic-bezier(.2,.8,.2,1) both}@keyframes lggy{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@media (prefers-reduced-motion:reduce){.lg-pv,.lg-bar,.lg-grow{animation:none!important}}
`

export type { LigaData }
