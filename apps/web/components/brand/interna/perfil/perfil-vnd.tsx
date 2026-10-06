'use client'

// Perfil — VND (spec 05 §1.2/§1.5, gamificado). Banner verde pontilhado+chevrons, anéis KPI,
// abas Visão geral/Conquistas/Histórico/Desempenho. Prefixo CSS `pvn-`.
// DADOS REAIS (PerfilData): renderiza só seções com fonte real; nada de botão/toggle inerte.

import { useState } from 'react'
import Link from 'next/link'
import { internaTokensStyle, INTERNA_RADIUS, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import { BK, Ic, Tabs, type TabDef, notec, fnum, LineSvg } from './shared'
import { useIsMobile } from './use-is-mobile'
import type { PerfilData } from './data'

const VP = 'M1.00 5.90L11.51 5.77Q12.20 5.76 12.53 6.13L21.21 15.98Q21.47 16.25 21.57 15.86L21.60 8.10C21.60 7.05 20.81 6.30 19.76 5.88L30.57 5.90Q31.00 5.91 30.74 6.33L23.18 14.49C22.26 15.55 21.80 16.65 21.73 18.23L21.67 25.45Q21.60 26.24 20.95 25.96L6.03 8.31C4.78 6.96 3.14 6.19 1.00 5.90Z'

const TABS: TabDef[] = [
  { key: 'info', label: 'Visão geral', icon: 'home' },
  { key: 'conq', label: 'Conquistas', icon: 'medal' },
  { key: 'hist', label: 'Histórico', icon: 'clock' },
  { key: 'est', label: 'Desempenho', icon: 'trend' },
]
const TABS_MOB: TabDef[] = [
  { key: 'info', label: 'Geral', icon: 'home' },
  { key: 'conq', label: 'Conquistas', icon: 'medal' },
  { key: 'hist', label: 'Histórico', icon: 'clock' },
  { key: 'est', label: 'Desempenho', icon: 'trend' },
]

const bk = new BK('vnd')
const DASH = '—'

function Chevrons() {
  const defs: [number, string, number][] = [[-90, 'rgba(232,200,119,.55)', 2], [-50, 'rgba(185,245,212,.14)', 1.2], [-10, 'rgba(185,245,212,.1)', 1.2]]
  return <>{defs.map(([b, c, w], k) => (
    <svg key={k} className={`pvn-chev pvn-c${k + 1}`} viewBox="0 0 200 120" aria-hidden preserveAspectRatio="none" style={{ position: 'absolute', right: '-4%', width: '62%', height: 220, bottom: b, pointerEvents: 'none' }}><path d="M0 0 L100 112 L200 0" fill="none" stroke={c} strokeWidth={w} vectorEffect="non-scaling-stroke" /></svg>
  ))}</>
}

function Avatar({ size, data }: { size: number; data: PerfilData }) {
  const h = data.header
  if (h.avatarUrl) return <img src={h.avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
  return <span style={{ width: '100%', height: '100%', borderRadius: '50%', background: h.avatarCor || 'linear-gradient(160deg,#F7C25A,#E8952A)', color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.36), fontWeight: 800 }}>{h.iniciais}</span>
}

function LvlRing({ size, p, inner }: { size: number; p: number; inner: React.ReactNode }) {
  const r = (size - 8) / 2, C = 2 * Math.PI * r
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-flex', flexShrink: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={4} />
        <circle className="pvn-ring" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E8C877" strokeWidth={4} strokeLinecap="round" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - p)).toFixed(1)} style={{ ['--c' as any]: C.toFixed(1) }} />
      </svg>
      <span style={{ position: 'absolute', inset: 8, display: 'flex' }}>{inner}</span>
    </span>
  )
}

function Header({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const h = data.header
  const av = mobile ? 88 : 112
  const ringP = h.gamAtivo && h.xpNivelMax > 0 ? Math.min(1, h.xpNivelAtual / h.xpNivelMax) : 0
  const meta: [string, string][] = []
  if (h.foco) meta.push(['target', h.foco])
  if (h.gamAtivo && h.liga) meta.push(['trophy', h.posicaoLiga != null ? `${h.liga} · ${h.posicaoLiga}º` : h.liga])
  if (h.gamAtivo && h.recorde > 0) meta.push(['flame', `Recorde: ${h.recorde} dias seguidos`])
  const banner = (
    <section style={{ position: 'relative', overflow: 'hidden', height: mobile ? 150 : 210, background: 'linear-gradient(120deg,#041A10 0%,#0B4A2E 55%,#12643D 100%)' }}>
      <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(185,245,212,.18) 1.2px,transparent 1.8px)', backgroundSize: '22px 22px', pointerEvents: 'none' }} />
      <Chevrons />
      <svg viewBox="0 0 32 32" aria-hidden style={{ position: 'absolute', right: mobile ? -20 : '8%', top: mobile ? -10 : -30, width: mobile ? 170 : 280, height: mobile ? 170 : 280, opacity: 0.08 }}><path fill="#FFF" d={VP} /></svg>
      {h.memberSince ? <span style={{ position: 'absolute', left: mobile ? 18 : 32, top: 20, display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 99, background: 'rgba(255,255,255,.14)', color: '#FFF', fontSize: 11.5, fontWeight: 700 }}><Ic n="crown" s={13} />Aluno desde {h.memberSince}</span> : null}
      <span style={{ position: 'absolute', left: mobile ? 18 : 32, top: 54, fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: '#86CFA6' }}>FUTURO DEFENSOR</span>
    </section>
  )
  const who = (
    <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', gap: mobile ? 14 : 20, alignItems: mobile ? undefined : 'flex-start', padding: `0 ${mobile ? 18 : 32}px ${mobile ? 20 : 24}px`, position: 'relative' }}>
      <div style={{ position: 'relative', padding: 5, borderRadius: '50%', background: 'var(--bg)', alignSelf: 'flex-start', marginTop: -(av / 2 + 5), marginBottom: mobile ? -14 : 0 }}>
        {h.gamAtivo
          ? <LvlRing size={av} p={ringP} inner={<Avatar size={av} data={data} />} />
          : <span style={{ width: av, height: av, display: 'inline-flex' }}><Avatar size={av} data={data} /></span>}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: mobile ? 0 : 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: mobile ? 24 : 28, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--ink)' }}>{h.nome}</b>
          {h.gamAtivo ? <span style={{ height: 24, padding: '0 10px', borderRadius: 99, background: 'linear-gradient(180deg,#F1D48A,#D8B45A)', color: '#2A1F02', fontSize: 11.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>Nv {h.nivel} · {h.tituloNivel}</span> : null}
        </div>
        {meta.length ? (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 12.5, color: 'var(--muted)' }}>
            {meta.map(([i, t]) => <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ic n={i} s={14} />{t}</span>)}
          </div>
        ) : null}
        {h.gamAtivo ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, maxWidth: 420 }}>
            <div style={{ flex: 1 }}>{bk.bar(Math.round(ringP * 100), 'var(--gold, #E8C877)', 8)}</div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{h.xpNivelAtual}/{h.xpNivelMax} XP</span>
          </div>
        ) : null}
      </div>
    </div>
  )
  return <>{banner}<div style={{ borderBottom: '1px solid var(--line)' }}>{who}</div></>
}

// ---------------------------------------------------------------- KPI (anéis + cards)
function Ring({ p, color, size = 70, sw = 7, inner }: { p: number; color: string; size?: number; sw?: number; inner: React.ReactNode }) {
  const r = (size - sw) / 2, C = 2 * Math.PI * r
  return (
    <span style={{ position: 'relative', width: size, height: size, flexShrink: 0, display: 'inline-flex' }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={sw} />
        <circle className="pvn-ring" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - p)).toFixed(1)} style={{ ['--c' as any]: C.toFixed(1) }} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>{inner}</span>
    </span>
  )
}

function Kpis({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const k = data.kpis, h = data.header
  const acerto = k.acertoMedio
  const items: { p: number; color: string; inner: React.ReactNode; t: string; s: string }[] = [
    { p: acerto == null ? 0 : acerto / 100, color: 'var(--brand)', inner: <b style={{ fontSize: 16, color: 'var(--ink)' }}>{acerto == null ? DASH : `${Math.round(acerto)}%`}</b>, t: 'Acerto médio', s: `${k.simuladosFeitos} simulados` },
    { p: k.notaMedia == null ? 0 : Math.min(1, k.notaMedia / 100), color: 'var(--gold, #E8C877)', inner: <b style={{ fontSize: 15, color: 'var(--ink)' }}>{k.notaMedia == null ? DASH : fnum(k.notaMedia)}</b>, t: 'Nota média', s: k.melhorNota == null ? 'sem recorde' : `melhor ${fnum(k.melhorNota)}` },
  ]
  if (h.gamAtivo) {
    const ringP = h.xpNivelMax > 0 ? Math.min(1, h.xpNivelAtual / h.xpNivelMax) : 0
    items.push({ p: ringP, color: '#7C6CF0', inner: <b style={{ fontSize: 15, color: 'var(--ink)' }}>Nv {h.nivel}</b>, t: 'Próximo nível', s: `${Math.max(0, h.xpNivelMax - h.xpNivelAtual)} XP p/ o ${h.nivel + 1}` })
    items.push({ p: 0, color: '#F0773A', inner: <Ic n="flame" s={24} c="#F0773A" />, t: 'Sequência', s: `${h.streak} dias · recorde ${h.recorde}` })
  }
  const cols = mobile ? 1 : items.length
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 12 }}>
      {items.map((it, idx) => (
        <div key={idx} className="pvn-lift" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 22, background: 'var(--surface)', border: '1px solid var(--line)' }}>
          <Ring p={it.p} color={it.color} size={mobile ? 60 : 70} sw={7} inner={it.inner} />
          <div style={{ minWidth: 0 }}><b style={{ display: 'block', fontSize: 14, color: 'var(--ink)' }}>{it.t}</b><span style={{ fontSize: 12, color: 'var(--muted)' }}>{it.s}</span></div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Visão geral (perfil de estudos + Lei Seca)
function TabGeral({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const h = data.header
  const rows: [string, string, string | null][] = [
    ['trend', 'Matéria mais forte', data.matForte],
    ['flag', 'Matéria a reforçar', data.matReforcar],
    ['cal', 'Estuda na plataforma desde', h.memberSince],
    ['target', 'Foco', h.foco],
  ]
  const dados = bk.card(<>
    {bk.head('cap', 'Seu perfil de estudo')}
    {rows.filter(([, , v]) => v).map(([i, lab, val], k) => (
      <div key={lab} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: k ? '1px solid var(--line)' : undefined }}>
        <span style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--surface2)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n={i} s={15} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{lab}</span>
          <b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)' }}>{val}</b>
        </div>
      </div>
    ))}
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 11.5, color: 'var(--muted)' }}><Ic n="lock" s={13} />Dados pessoais não aparecem no perfil.</div>
  </>)

  const lei = data.leiSeca.length ? bk.card(<>
    {bk.head('books', 'Meu Desafio de Lei Seca')}
    {data.leiSeca.map(({ lei, feitas, total }, k) => (
      <div key={lei} style={{ padding: '8px 0', borderTop: k ? '1px solid var(--line)' : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}><b style={{ color: 'var(--ink)' }}>{lei}</b><span style={{ color: 'var(--muted)' }}>{feitas}/{total} aulas</span></div>
        {bk.bar(total > 0 ? Math.round(100 * feitas / total) : 0, feitas >= total ? 'var(--gold, #E8C877)' : undefined, 6)}
      </div>
    ))}
    <div style={{ marginTop: 14 }}>
      <Link href={data.trilhaHref} style={{ textDecoration: 'none' }}>{bk.btn('Ir para a trilha', 'play', 'primary', 38, true)}</Link>
    </div>
  </>) : null

  if (mobile) return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{dados}{lei}</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: lei ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr', gap: 16, alignItems: 'start' }}>{dados}{lei}</div>
  )
}

// ---------------------------------------------------------------- Conquistas (medalhas 3D)
function Medal({ a, size = 58 }: { a: PerfilData['conquistas'][number]; size?: number }) {
  const c = a.cor || 'var(--brand)'
  const on = a.desbloqueada
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: size + 34, textAlign: 'center' }}>
      <span style={{ width: size, height: size, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...(on ? { background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${c} 70%, #fff), ${c} 60%, color-mix(in srgb, ${c} 70%, #000))`, color: '#FFF', boxShadow: `0 5px 0 color-mix(in srgb, ${c} 60%, #000), 0 12px 20px -10px ${c}` } : { background: 'var(--surface2)', color: 'var(--muted)', boxShadow: '0 5px 0 var(--line2)' }) }}><Ic n={on ? 'medal' : 'lock'} s={Math.round(size * 0.4)} /></span>
      <b style={{ fontSize: 11.5, lineHeight: 1.25, color: on ? 'var(--ink)' : 'var(--muted)' }}>{a.titulo}</b>
      {on ? null : a.criterio ? <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{a.criterio}</span> : null}
    </div>
  )
}

function TabConq({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const total = data.conquistas.length
  const got = data.conquistas.filter((a) => a.desbloqueada).length
  const vitrine = (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 22, background: 'linear-gradient(160deg,#041A10,#0B4A2E 60%,#12643D)' }}>
      <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(185,245,212,.14) 1.2px,transparent 1.8px)', backgroundSize: '20px 20px', pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.2em', color: '#F1D48A' }}>VITRINE</span>
        <b style={{ display: 'block', marginTop: 6, fontSize: 24, letterSpacing: '-0.03em', color: '#FFF' }}>{got} de {total} medalhas</b>
        <span style={{ fontSize: 13, color: '#CFE3D7' }}>Conquiste mais estudando e fazendo simulados.</span>
        {total ? <div style={{ marginTop: 14, display: 'flex', gap: 3, maxWidth: 280 }}>{Array.from({ length: total }).map((_, k) => <span key={k} style={{ flex: 1, height: 8, borderRadius: 3, background: k < got ? '#E8C877' : 'rgba(255,255,255,.16)' }} />)}</div> : null}
      </div>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {vitrine}
      {total ? bk.card(
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 6px' }}>{data.conquistas.map((a, k) => <Medal key={k} a={a} size={mobile ? 50 : 58} />)}</div>
      , 18) : null}
    </div>
  )
}

// ---------------------------------------------------------------- Histórico (timeline)
function VRing({ v, size = 46 }: { v: number; size?: number }) {
  const r = (size - 6) / 2 - 1, C = 2 * Math.PI * r
  const [col] = notec(v)
  return (
    <span style={{ position: 'relative', width: size, height: size, flexShrink: 0, display: 'inline-block', borderRadius: '50%', background: 'rgba(4,26,16,.75)', boxShadow: '0 6px 16px -6px rgba(0,0,0,.6)' }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth={4} />
        <circle className="pvn-ring" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={4} strokeLinecap="round" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - v / 100)).toFixed(1)} style={{ ['--c' as any]: C.toFixed(1) }} />
      </svg>
      <b style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, color: '#FFF' }}>{v}</b>
    </span>
  )
}

function TabHist({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const hist = data.historico
  if (hist.length === 0) {
    return bk.card(<>{bk.head('clock', 'Histórico de simulados')}<span style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhum simulado realizado ainda.</span></>)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--goldInk)' }}><Ic n="clock" s={13} />{hist.length} simulados</span>
      {hist.map((item, k) => {
        const last = k === hist.length - 1
        const [rc] = notec(item.acerto)
        const card = (
          <div className="pvn-rowh" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', marginBottom: 10, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <VRing v={item.acerto} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 14, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.simulado}</b>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                {([['cal', item.quando], ['star', item.nota == null ? 'sem nota' : 'nota ' + fnum(item.nota)], ['clock', item.tempo]] as [string, string][]).map(([i, v]) => (
                  <span key={v} style={{ height: 22, padding: '0 8px', borderRadius: 99, background: 'var(--surface2)', fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Ic n={i} s={11} />{v}</span>
                ))}
              </div>
            </div>
            {item.href ? <Ic n="cr" s={16} c="var(--muted)" /> : null}
          </div>
        )
        return (
          <div key={k} style={{ display: 'flex', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0 }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--surface)', border: `3px solid ${rc}`, marginTop: 22 }} />
              {last ? null : <span style={{ flex: 1, width: 2, background: 'var(--line2)', marginTop: 4 }} />}
            </div>
            {item.href ? <Link href={item.href} style={{ textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0, display: 'flex' }}>{card}</Link> : card}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- Desempenho (disciplina + evolução)
function DiscCard({ data }: { data: PerfilData }) {
  return bk.card(<>
    {bk.head('target', 'Acerto por disciplina', undefined, `${data.porDisciplina.length} matérias`)}
    {data.porDisciplina.map(({ nome, aluno, turma }) => {
      const [c] = notec(aluno)
      return (
        <div key={nome} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 40px', alignItems: 'center', gap: 10, padding: '6px 0' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nome}</span>
          <div style={{ position: 'relative' }}>
            {bk.bar(Math.max(aluno, 1), c, 7)}
            <span title={`Turma: ${turma}%`} style={{ position: 'absolute', top: -3, bottom: -3, left: `calc(${Math.min(100, Math.max(0, turma))}% - 1px)`, width: 2, background: 'var(--ink)', opacity: 0.5, borderRadius: 2 }} />
          </div>
          <b style={{ textAlign: 'right', fontSize: 12.5, color: c }}>{aluno}%</b>
        </div>
      )
    })}
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
      <span style={{ width: 2, height: 12, background: 'var(--ink)', opacity: 0.5, borderRadius: 2 }} />Marcador = média da turma (anônima)
    </div>
  </>)
}

function EvoCard({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const w = mobile ? 360 : 600, h = mobile ? 150 : 180
  const vals = data.evolucao.map((e) => e.nota)
  const labels = data.evolucao.map((e) => e.rotulo)
  return bk.card(<>
    {bk.head('trend', 'Evolução da nota', undefined, 'Nota média por período')}
    {vals.length === 0 ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>Sem dados de evolução ainda.</span> : (
      <div className="pvn-pv">
        <LineSvg vals={vals} w={w} h={h} color="var(--brand)" fill="var(--chip)" />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>{labels.map((m) => <span key={m} style={{ fontSize: 10, color: 'var(--muted)' }}>{m}</span>)}</div>
      </div>
    )}
  </>)
}

function TabEst({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  if (mobile) return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><EvoCard mobile data={data} /><DiscCard data={data} /></div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}><EvoCard mobile={false} data={data} /><DiscCard data={data} /></div>
  )
}

const CSS = `
.pvn-pv{animation:pvnpv .45s cubic-bezier(.22,1,.36,1) both}
@keyframes pvnpv{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.ptab{transition:background .25s,color .25s}
.pvn-rowh{transition:background .2s}.pvn-rowh:hover{background:var(--surface2)}
.pvn-lift{transition:transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s,border-color .3s}
.pvn-lift:hover{transform:translateY(-4px);box-shadow:0 22px 40px -28px rgba(0,0,0,.45)}
.pvn-ring{animation:pvnring 1.4s cubic-bezier(.22,1,.36,1) both}
@keyframes pvnring{from{stroke-dashoffset:var(--c)}}
.pbar{transform-origin:left center;animation:pvnbar 1.2s cubic-bezier(.22,1,.36,1) .5s both}
@keyframes pvnbar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.pseg{animation:pvnseg .5s ease-out both}@keyframes pvnseg{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
.pln{stroke-dasharray:1400;stroke-dashoffset:1400;animation:pvnln 1.4s ease-out .3s forwards}
@keyframes pvnln{to{stroke-dashoffset:0}}
.pgrow{transform-box:fill-box;transform-origin:center bottom;animation:pvngrow 1s cubic-bezier(.22,1,.36,1) both}
@keyframes pvngrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.pvn-chev{opacity:0;animation:pvnchev 1s ease-out forwards}
.pvn-c1{animation-delay:.1s}.pvn-c2{animation-delay:.25s}.pvn-c3{animation-delay:.4s}
@keyframes pvnchev{to{opacity:1}}
@media (prefers-reduced-motion:reduce){
  .pvn-ring,.pbar,.pseg,.pvn-chev,.pgrow{animation:none!important}
  .pbar{transform:none}.pvn-chev{opacity:1}.pgrow{transform:none}
  .pln{stroke-dashoffset:0!important;animation:none!important}
}
`

export function PerfilVnd({ theme: themeProp, data }: { theme: InternaTheme; data: PerfilData }) {
  const theme = useTemaInterno(themeProp)
  const [pf, setPf] = useState('info')
  const mobile = useIsMobile()
  const body = (
    <>
      <Kpis mobile={mobile} data={data} />
      <div><Tabs bk={bk} tabs={mobile ? TABS_MOB : TABS} active={pf} onPick={setPf} mobile={mobile} /></div>
      <div className="pvn-pv" key={pf}>
        {pf === 'info' && <TabGeral mobile={mobile} data={data} />}
        {pf === 'conq' && <TabConq mobile={mobile} data={data} />}
        {pf === 'hist' && <TabHist mobile={mobile} data={data} />}
        {pf === 'est' && <TabEst mobile={mobile} data={data} />}
      </div>
    </>
  )
  return (
    <div style={{ ...internaTokensStyle('vnd', theme), ['--r' as any]: `${INTERNA_RADIUS.vnd}px`, minHeight: '100%', background: 'var(--bg)' }}>
      <style>{CSS}</style>
      <Header mobile={mobile} data={data} />
      <div style={{ padding: mobile ? '18px 18px 28px' : '24px 32px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>{body}</div>
    </div>
  )
}
