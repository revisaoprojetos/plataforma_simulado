'use client'

// Perfil — REVISÃO (spec 05 §1.2/§1.3/§1.4). Banner roxo grade+quadrados, emblema "R" (.run),
// KPI strip 6, abas Informações/Histórico/Conquistas/Estatísticas. Prefixo CSS `prv-`.
// DADOS REAIS (PerfilData): renderiza só seções com fonte real; nada de botão/toggle inerte.

import { useState } from 'react'
import Link from 'next/link'
import { internaTokensStyle, INTERNA_RADIUS, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import { BK, Ic, Tabs, type TabDef, notec, fnum, Donut, BarsSvg, LineSvg } from './shared'
import { useIsMobile } from './use-is-mobile'
import type { PerfilData } from './data'

const REV_R = 'M6 5.5H32C43.5 5.5 49 13 49 23C49 31 45 37 39.5 40.5L62 61H6Z M9.2 9.2H19.2V57.6H9.2Z'
const REV_RO = 'M6 5.5H32C43.5 5.5 49 13 49 23C49 31 45 37 39.5 40.5L62 61H6Z'

const TABS: TabDef[] = [
  { key: 'info', label: 'Informações', icon: 'user' },
  { key: 'hist', label: 'Histórico', icon: 'clock' },
  { key: 'conq', label: 'Conquistas', icon: 'medal' },
  { key: 'est', label: 'Estatísticas', icon: 'chart' },
]
const TABS_MOB: TabDef[] = [
  { key: 'info', label: 'Info', icon: 'user' },
  { key: 'hist', label: 'Histórico', icon: 'clock' },
  { key: 'conq', label: 'Conquistas', icon: 'medal' },
  { key: 'est', label: 'Estatíst.', icon: 'chart' },
]

const bk = new BK('revisao')

// quadrados decorativos determinísticos do banner
function squares(W: number, H: number, g: number, n: number, seed: number) {
  let s = seed
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  const cells: { c: number; r: number; d: number; k: number }[] = []
  const set = new Set<string>()
  let k = 0
  while (cells.length < n) {
    const c = Math.floor(rnd() * (W / g + 1)), r = Math.floor(rnd() * (H / g + 1))
    const key = `${c},${r}`
    if (!set.has(key)) { set.add(key); cells.push({ c, r, d: rnd() * 7.5 + 0.5, k: k++ }) }
  }
  return cells.map(({ c, r, d, k }) => (
    <span key={k} className="prv-px" style={{ left: c * g + 1, top: r * g + 1, width: g - 1, height: g - 1, background: k % 3 === 0 ? 'rgba(185,168,255,.22)' : 'rgba(241,194,50,.2)', animationDelay: `${d.toFixed(2)}s` }} />
  ))
}

function LvlRing({ size, p, color, inner }: { size: number; p: number; color: string; inner: React.ReactNode }) {
  const r = (size - 8) / 2, C = 2 * Math.PI * r
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-flex', flexShrink: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={4} />
        <circle className="prv-ring" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - p)).toFixed(1)} style={{ ['--c' as any]: C.toFixed(1) }} />
      </svg>
      <span style={{ position: 'absolute', inset: 8, display: 'flex' }}>{inner}</span>
    </span>
  )
}

function Avatar({ size, data }: { size: number; data: PerfilData }) {
  const h = data.header
  if (h.avatarUrl) return <img src={h.avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
  return <span style={{ width: '100%', height: '100%', borderRadius: '50%', background: h.avatarCor || 'linear-gradient(160deg,#F7C25A,#E8952A)', color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.36), fontWeight: 800 }}>{h.iniciais}</span>
}

function WhoRow({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const h = data.header
  const av = mobile ? 84 : 96
  const ringP = h.gamAtivo && h.xpNivelMax > 0 ? Math.min(1, h.xpNivelAtual / h.xpNivelMax) : 0
  const meta: [string, string][] = []
  if (h.foco) meta.push(['target', h.foco])
  if (h.gamAtivo && h.liga) meta.push(['trophy', h.posicaoLiga != null ? `${h.liga} · ${h.posicaoLiga}º` : h.liga])
  if (h.gamAtivo && h.recorde > 0) meta.push(['flame', `Recorde: ${h.recorde} dias seguidos`])
  return (
    <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', gap: mobile ? 14 : 20, alignItems: mobile ? undefined : 'flex-start', padding: `0 ${mobile ? 20 : 32}px ${mobile ? 20 : 24}px`, position: 'relative' }}>
      <div style={{ position: 'relative', padding: 5, borderRadius: '50%', background: mobile ? 'var(--surface)' : 'var(--bg)', alignSelf: 'flex-start', marginTop: -(av / 2 + 5), marginBottom: mobile ? -14 : 0 }}>
        {h.gamAtivo
          ? <LvlRing size={av} p={ringP} color="#F1C232" inner={<Avatar size={av} data={data} />} />
          : <span style={{ width: av, height: av, display: 'inline-flex' }}><Avatar size={av} data={data} /></span>}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: mobile ? 0 : 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: mobile ? 24 : 28, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--ink)' }}>{h.nome}</b>
          {h.gamAtivo ? <span style={{ height: 24, padding: '0 10px', borderRadius: 99, background: '#F1C232', color: '#2A1A55', fontSize: 11.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>Nv {h.nivel} · {h.tituloNivel}</span> : null}
        </div>
        {meta.length ? (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 12.5, color: 'var(--muted)' }}>
            {meta.map(([i, t]) => <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ic n={i} s={14} />{t}</span>)}
          </div>
        ) : null}
        {h.gamAtivo ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, maxWidth: 420 }}>
            <div style={{ flex: 1 }}>{bk.bar(Math.round(ringP * 100), undefined, 7)}</div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{h.xpNivelAtual}/{h.xpNivelMax} XP</span>
          </div>
        ) : null}
      </div>
      {h.memberSince ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: mobile ? 'flex-start' : 'flex-end', gap: 12, paddingTop: mobile ? 0 : 16 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)' }}><Ic n="crown" s={14} />Aluno desde {h.memberSince}</span>
        </div>
      ) : null}
    </div>
  )
}

function Header({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const Hb = mobile ? 120 : 210
  const g = mobile ? 32 : 44
  const banner = (
    <div style={{ position: 'relative', height: Hb, background: 'linear-gradient(120deg,#24166A,#4B30BE 55%,#6449E0)', overflow: 'hidden' }}>
      <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: `${g}px ${g}px`, pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{squares(mobile ? 350 : 1180, Hb, g, mobile ? 6 : 12, mobile ? 11 : 17)}</div>
      {mobile ? null : (
        <svg className="prv-emb" viewBox="0 0 68 66" aria-hidden style={{ position: 'absolute', right: 60, top: '50%', marginTop: -88, width: 180, height: 175, pointerEvents: 'none' }}>
          <path fillRule="evenodd" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.12)" strokeWidth={0.25} d={REV_R} />
          <path className="prv-run" fill="none" stroke="#F1C232" strokeWidth={0.45} strokeLinecap="round" d={REV_RO} />
        </svg>
      )}
      {mobile ? null : <span style={{ position: 'absolute', left: 32, top: 56, fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: '#F1C232' }}>RUMO À PROCURADORIA</span>}
    </div>
  )
  if (mobile) {
    return <div className="card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 22, overflow: 'hidden' }}>{banner}<WhoRow mobile data={data} /></div>
  }
  return <>{banner}<div style={{ borderBottom: '1px solid var(--line)' }}><WhoRow mobile={false} data={data} /></div></>
}

// ---------------------------------------------------------------- KPI strip (6)
const DASH = '—'
function Kpis({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const k = data.kpis
  const items: [string, string, string][] = [
    ['clip', String(k.simuladosFeitos), 'Simulados feitos'],
    ['star', k.notaMedia == null ? DASH : fnum(k.notaMedia), 'Nota média'],
    ['target', k.acertoMedio == null ? DASH : `${Math.round(k.acertoMedio)}%`, 'Acerto médio'],
    ['clock', k.tempoMedioMin == null ? DASH : `${k.tempoMedioMin} min`, 'Tempo médio'],
    ['trophy', k.melhorNota == null ? DASH : fnum(k.melhorNota), 'Melhor nota'],
    ['bolt', k.xpMes == null ? DASH : String(k.xpMes), 'XP este mês'],
  ]
  const cols = mobile ? 2 : 6
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 10 }}>
      {items.map(([i, v, l], idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
          <span style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n={i} s={17} /></span>
          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{v}</b>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- tab: Informações (perfil de estudos + Lei Seca)
function TabInfo({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const h = data.header
  const rows: [string, string, string | null][] = [
    ['trend', 'Matéria mais forte', data.matForte],
    ['flag', 'Matéria a reforçar', data.matReforcar],
    ['cal', 'Estuda na plataforma desde', h.memberSince],
    ['target', 'Foco', h.foco],
  ]
  const dados = bk.card(<>
    {bk.head('cap', 'Perfil de estudos')}
    {rows.filter(([, , v]) => v).map(([i, lab, val], k) => (
      <div key={lab} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: k ? '1px solid var(--line)' : undefined }}>
        <span style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--surface2)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n={i} s={15} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{lab}</span>
          <b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)' }}>{val}</b>
        </div>
      </div>
    ))}
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8, padding: '10px 12px', borderRadius: 12, background: 'var(--surface2)', fontSize: 11.5, lineHeight: 1.45, color: 'var(--muted)' }}><Ic n="lock" s={14} /><span>E-mail, telefone e outros dados pessoais ficam só nas configurações da conta e nunca aparecem no perfil.</span></div>
  </>)

  const lei = data.leiSeca.length ? bk.card(<>
    {bk.head('books', 'Meu Desafio de Lei Seca')}
    {data.leiSeca.map(({ lei, feitas, total }, k) => (
      <div key={lei} style={{ padding: '8px 0', borderTop: k ? '1px solid var(--line)' : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}><b style={{ color: 'var(--ink)' }}>{lei}</b><span style={{ color: 'var(--muted)' }}>{feitas}/{total} aulas</span></div>
        {bk.bar(total > 0 ? Math.round(100 * feitas / total) : 0, undefined, 6)}
      </div>
    ))}
    <div style={{ marginTop: 14 }}>
      <Link href={data.trilhaHref} style={{ textDecoration: 'none' }}>{bk.btn('Ir para a trilha', 'play', 'primary', 38, true)}</Link>
    </div>
  </>) : null

  if (mobile) return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{dados}{lei}</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: lei ? '1fr 1fr' : '1fr', gap: 16, alignItems: 'start' }}>
      {dados}{lei}
    </div>
  )
}

// ---------------------------------------------------------------- tab: Histórico
function TabHist({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const hist = data.historico
  const Row = ({ item, k, border }: { item: PerfilData['historico'][number]; k: number; border: boolean }) => {
    const n = item.nota
    const [fg, bg] = n == null ? ['var(--muted)', 'var(--surface2)'] : notec(n)
    const [af] = notec(item.acerto)
    if (mobile) {
      const inner = (
        <div className="prv-rowh" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderTop: border ? '1px solid var(--line)' : undefined }}>
          <span style={{ width: 44, height: 44, borderRadius: 13, background: bg, color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{n == null ? DASH : fnum(n)}</span>
          <div style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.simulado}</b><span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{item.quando} · {item.acerto}% acerto · {item.tempo}</span></div>
          {item.href ? <Ic n="cr" s={16} c="var(--muted)" /> : null}
        </div>
      )
      return item.href ? <Link key={k} href={item.href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{inner}</Link> : <div key={k}>{inner}</div>
    }
    const cols = 'minmax(0,2.4fr) 1fr 0.9fr 1.3fr 0.9fr'
    const inner = (
      <div className="prv-rowh" style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', gap: 16, padding: '11px 10px', borderTop: '1px solid var(--line)' }}>
        <b style={{ fontSize: 13.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.simulado}</b>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{item.quando}</span>
        <span style={{ justifySelf: 'start', height: 26, padding: '0 10px', borderRadius: 8, background: bg, color: fg, fontSize: 12.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>{n == null ? DASH : fnum(n)}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1 }}>{bk.bar(item.acerto, af, 6)}</div><span style={{ width: 34, fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{item.acerto}%</span></div>
        <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{item.tempo}</span>
      </div>
    )
    return item.href ? <Link key={k} href={item.href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{inner}</Link> : <div key={k}>{inner}</div>
  }
  const header = !mobile ? (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.4fr) 1fr 0.9fr 1.3fr 0.9fr', gap: 16, padding: '0 10px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
      {['Simulado', 'Data', 'Nota', 'Acerto', 'Tempo'].map((hh) => <span key={hh}>{hh}</span>)}
    </div>
  ) : null
  return bk.card(<>
    {bk.head('clock', 'Histórico de simulados', <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{hist.length} registros</span>)}
    {hist.length === 0
      ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhum simulado realizado ainda.</span>
      : <div style={{ marginTop: 4 }}>{header}{hist.map((item, k) => <Row key={k} item={item} k={k} border={k > 0} />)}</div>}
  </>)
}

// ---------------------------------------------------------------- tab: Conquistas
function Badge({ a, mobile }: { a: PerfilData['conquistas'][number]; mobile: boolean }) {
  const sz = mobile ? 52 : 60
  const c = a.cor || 'var(--brand)'
  const on = a.desbloqueada
  return (
    <div className="prv-lift" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: mobile ? '12px 8px' : '16px 12px', borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--line)', textAlign: 'center' }}>
      <span style={{ position: 'relative', width: sz, height: sz, borderRadius: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...(on ? { background: `linear-gradient(160deg,${c},color-mix(in srgb, ${c} 60%, #000))`, color: '#FFF', boxShadow: `0 10px 22px -12px ${c}` } : { background: 'var(--surface2)', color: 'var(--muted)', border: '1.5px dashed var(--line2)' }) }}>
        <Ic n={on ? 'medal' : 'lock'} s={mobile ? 21 : 24} />
      </span>
      <b style={{ fontSize: mobile ? 12 : 13, color: on ? 'var(--ink)' : 'var(--muted)', lineHeight: 1.25 }}>{a.titulo}</b>
      {a.criterio ? <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 }}>{a.criterio}</span> : null}
    </div>
  )
}

function TabConq({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const total = data.conquistas.length
  const got = data.conquistas.filter((a) => a.desbloqueada).length
  const head = bk.card(
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ position: 'relative', width: 74, height: 74, flexShrink: 0 }}>
        <Donut parts={[[total ? got / total : 0, 'var(--brand)'], [total ? 1 - got / total : 1, 'var(--track)']]} size={74} sw={9} />
        <b style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, color: 'var(--ink)' }}>{got}/{total}</b>
      </div>
      <div><b style={{ display: 'block', fontSize: 17, color: 'var(--ink)' }}>{got} de {total} conquistas</b><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Desbloqueie mais estudando e fazendo simulados.</span></div>
    </div>, 18)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {head}
      {total ? (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${mobile ? 3 : 6},1fr)`, gap: mobile ? 8 : 12 }}>
          {data.conquistas.map((a, k) => <Badge key={k} a={a} mobile={mobile} />)}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- tab: Estatísticas (disciplina + evolução)
function DiscCard({ data }: { data: PerfilData }) {
  return bk.card(<>
    {bk.head('target', 'Acerto por disciplina', undefined, `${data.porDisciplina.length} matérias, do maior para o menor`)}
    {data.porDisciplina.map(({ nome, aluno, turma }) => {
      const [c] = notec(aluno)
      return (
        <div key={nome} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 40px', alignItems: 'center', gap: 10, padding: '6px 0' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nome}</span>
          <div style={{ position: 'relative', height: 7 }}>
            {bk.bar(Math.max(aluno, 1), c, 7)}
            <span title={`Turma: ${turma}%`} style={{ position: 'absolute', top: -2, bottom: -2, left: `calc(${Math.min(100, Math.max(0, turma))}% - 1px)`, width: 2, background: 'var(--ink)', opacity: 0.55, borderRadius: 2 }} />
          </div>
          <b style={{ textAlign: 'right', fontSize: 12.5, color: c }}>{aluno}%</b>
        </div>
      )
    })}
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
      <span style={{ width: 2, height: 12, background: 'var(--ink)', opacity: 0.55, borderRadius: 2 }} />Marcador = média da turma (anônima)
    </div>
  </>)
}

function EvoCard({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const [ev, setEv] = useState<'bar' | 'line'>('bar')
  const w = mobile ? 360 : 640, h = mobile ? 150 : 200
  const vals = data.evolucao.map((e) => e.nota)
  const labels = data.evolucao.map((e) => e.rotulo)
  const tog = (
    <div style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--line)' }}>
      {(['bar', 'line'] as const).map((o) => (
        <button key={o} type="button" onClick={() => setEv(o)} style={{ height: 28, padding: '0 10px', border: 0, borderRadius: 7, background: ev === o ? 'var(--surface)' : 'transparent', color: ev === o ? 'var(--ink)' : 'var(--muted)', font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{o === 'bar' ? 'Barras' : 'Linha'}</button>
      ))}
    </div>
  )
  return bk.card(<>
    {bk.head('trend', 'Evolução da nota', tog, 'Nota média por período')}
    {vals.length === 0 ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>Sem dados de evolução ainda.</span> : ev === 'bar' ? (
      <div className="prv-pv"><BarsSvg vals={vals} labels={labels} w={w} h={h} color="var(--brand)" rad={6} /></div>
    ) : (
      <div className="prv-pv">
        <LineSvg vals={vals} w={w} h={h} color="var(--brand)" fill="var(--chip)" />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>{labels.map((m) => <span key={m} style={{ fontSize: 10, color: 'var(--muted)' }}>{m}</span>)}</div>
      </div>
    )}
  </>)
}

function TabEst({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  if (mobile) return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><EvoCard mobile data={data} /><DiscCard data={data} /></div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
      <EvoCard mobile={false} data={data} /><DiscCard data={data} />
    </div>
  )
}

const CSS = `
.prv-pv{animation:prvpv .45s cubic-bezier(.22,1,.36,1) both}
@keyframes prvpv{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.ptab{transition:background .25s,color .25s}
.prv-rowh{transition:background .2s}.prv-rowh:hover{background:var(--surface2)}
.prv-lift{transition:transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s,border-color .3s}
.prv-lift:hover{transform:translateY(-4px);box-shadow:0 22px 40px -28px rgba(0,0,0,.45)}
.prv-px{position:absolute;border-radius:3px;animation:prvpx 4s ease-in-out infinite}
@keyframes prvpx{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:.9;transform:scale(1)}}
.prv-run{stroke-dasharray:22 400;stroke-dashoffset:0;animation:prvrun 8s linear infinite}
@keyframes prvrun{to{stroke-dashoffset:-422}}
.prv-ring{animation:prvring 1.4s cubic-bezier(.22,1,.36,1) both}
@keyframes prvring{from{stroke-dashoffset:var(--c)}}
.pbar{transform-origin:left center;animation:prvbar 1.2s cubic-bezier(.22,1,.36,1) .5s both}
@keyframes prvbar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.pseg{animation:prvseg .5s ease-out both}@keyframes prvseg{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
.pgrow{transform-box:fill-box;transform-origin:center bottom;animation:prvgrow 1s cubic-bezier(.22,1,.36,1) both}
@keyframes prvgrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.pln{stroke-dasharray:1200;stroke-dashoffset:1200;animation:prvln 1.2s ease-out .3s forwards}
@keyframes prvln{to{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){
  .prv-px,.prv-run{animation:none!important}
  .prv-ring,.pbar,.pseg,.pgrow{animation:none!important}
  .pgrow{transform:none}.pbar{transform:none}
  .pln{stroke-dashoffset:0!important;animation:none!important}
}
`

export function PerfilRevisao({ theme: themeProp, data }: { theme: InternaTheme; data: PerfilData }) {
  const theme = useTemaInterno(themeProp)
  const [pf, setPf] = useState('info')
  const mobile = useIsMobile()
  const body = (
    <>
      <Kpis mobile={mobile} data={data} />
      <div><Tabs bk={bk} tabs={mobile ? TABS_MOB : TABS} active={pf} onPick={setPf} mobile={mobile} /></div>
      <div className="prv-pv" key={pf}>
        {pf === 'info' && <TabInfo mobile={mobile} data={data} />}
        {pf === 'hist' && <TabHist mobile={mobile} data={data} />}
        {pf === 'conq' && <TabConq mobile={mobile} data={data} />}
        {pf === 'est' && <TabEst mobile={mobile} data={data} />}
      </div>
    </>
  )
  return (
    <div style={{ ...internaTokensStyle('revisao', theme), ['--r' as any]: `${INTERNA_RADIUS.revisao}px`, minHeight: '100%', background: 'var(--bg)' }}>
      <style>{CSS}</style>
      {mobile ? (
        <div style={{ padding: '20px 18px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}><Header mobile data={data} />{body}</div>
      ) : (
        <div><Header mobile={false} data={data} /><div style={{ padding: '24px 32px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>{body}</div></div>
      )}
    </div>
  )
}
