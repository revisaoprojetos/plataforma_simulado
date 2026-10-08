'use client'

// Perfil — MEQ (spec 05 §1.2/§1.6, denso "concurseiro"). Banner navy circuito+pulso,
// abas Resumo/Desempenho/Simulados/Selos. Prefixo CSS `pmq-`. Fonte Sora (link local, como loading-meq).
// DADOS REAIS (PerfilData): renderiza só seções com fonte real; nada de botão/toggle inerte.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { internaTokensStyle, INTERNA_RADIUS, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import { BK, Ic, Tabs, type TabDef, Segs, notec, fnum, BarsSvg } from './shared'
import { useIsMobile } from './use-is-mobile'
import type { PerfilData, PerfilPreferencias } from './data'
import { salvarPerfilPrefs } from '@/app/aluno/(portal)/perfil/actions'
import {
  MetaDiariaCard, PreferenciasCard, ResumoSemanaCard, AtividadeHeatmap, EstatKpiStrip,
  VoceMediaCard, BancaCard, FortesFracosCard, RendimentoHoraCard, TempoQuestaoCard, HistoricoTabela, PERFIL_BLOCOS_CSS,
} from './blocos'

const TABS: TabDef[] = [
  { key: 'info', label: 'Resumo', icon: 'grid' },
  { key: 'est', label: 'Desempenho', icon: 'chart' },
  { key: 'hist', label: 'Simulados', icon: 'clip' },
  { key: 'conq', label: 'Selos', icon: 'shield' },
]

const bk = new BK('meq')
const DASH = '—'

function cap(t: string) {
  return <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{t}</span>
}

// ---------------------------------------------------------------- header (banner circuito)
function Header({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const h = data.header
  const av = mobile ? 84 : 96
  const ringP = h.gamAtivo && h.xpNivelMax > 0 ? Math.min(1, h.xpNivelAtual / h.xpNivelMax) : 0
  const W = 1200
  const traces: [string, string][] = [
    [`M-10 40 H260 V90 H520 V30 H${W + 10}`, 'rgba(94,206,240,.35)'],
    [`M-10 120 H180 V70 H430 V130 H760 V60 H${W + 10}`, 'rgba(255,255,255,.12)'],
    [`M600 -10 V40 H900 V110 H${W + 10}`, 'rgba(255,255,255,.1)'],
  ]
  const nodes: [number, number][] = [[260, 40], [520, 90], [430, 70], [900, 40], [760, 130]]
  const meta: [string, string][] = []
  if (h.foco) meta.push(['target', h.foco])
  if (h.gamAtivo && h.liga) meta.push(['trophy', h.posicaoLiga != null ? `${h.liga} · ${h.posicaoLiga}º` : h.liga])
  if (h.gamAtivo && h.recorde > 0) meta.push(['flame', `Recorde: ${h.recorde} dias seguidos`])
  const banner = (
    <div style={{ position: 'relative', height: mobile ? 120 : 150, background: 'linear-gradient(120deg,#171E3B,#25356F 55%,#306AB5)', overflow: 'hidden' }}>
      <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px)', backgroundSize: '20px 20px', pointerEvents: 'none' }} />
      <svg className="pmq-circ" viewBox={`0 0 ${W} 150`} preserveAspectRatio="xMidYMid slice" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {traces.map(([d, c], i) => <path key={i} d={d} fill="none" stroke={c} strokeWidth={1.5} />)}
        <path className="pmq-pl" pathLength={1000} d={`M-10 40 H260 V90 H520 V30 H${W + 10}`} fill="none" stroke="#8BEAEA" strokeWidth={2.5} strokeLinecap="round" />
        {nodes.map(([x, y], i) => <rect key={i} x={x - 4} y={y - 4} width={8} height={8} rx={2} fill="#5ECEF0" opacity={0.7} />)}
      </svg>
      {h.memberSince ? <span style={{ position: 'absolute', left: mobile ? 20 : 28, top: 18, display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 7, background: 'rgba(255,255,255,.14)', color: '#FFF', fontSize: 11.5, fontWeight: 700 }}><Ic n="crown" s={13} />Aluno desde {h.memberSince}</span> : null}
    </div>
  )
  const avatar = h.avatarUrl
    ? <img src={h.avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
    : <span style={{ width: '100%', height: '100%', borderRadius: '50%', background: h.avatarCor || 'linear-gradient(160deg,#F7C25A,#E8952A)', color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(av * 0.36), fontWeight: 800 }}>{h.iniciais}</span>
  const who = (
    <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', gap: mobile ? 14 : 20, alignItems: mobile ? undefined : 'flex-start', padding: `0 ${mobile ? 20 : 32}px ${mobile ? 20 : 24}px`, position: 'relative' }}>
      <div style={{ position: 'relative', padding: 5, borderRadius: '50%', background: 'var(--surface)', alignSelf: 'flex-start', marginTop: -(av / 2 + 5), marginBottom: mobile ? -14 : 0 }}>
        {h.gamAtivo ? <LvlRing size={av} p={ringP} inner={avatar} /> : <span style={{ width: av, height: av, display: 'inline-flex' }}>{avatar}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: mobile ? 0 : 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: mobile ? 24 : 28, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--ink)' }}>{h.nome}</b>
          {h.gamAtivo ? <span style={{ height: 24, padding: '0 10px', borderRadius: 6, background: 'var(--brand2)', color: '#0B1124', fontSize: 11.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>Nv {h.nivel} · {h.tituloNivel}</span> : null}
        </div>
        {meta.length ? (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 12.5, color: 'var(--muted)' }}>
            {meta.map(([i, t]) => <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ic n={i} s={14} />{t}</span>)}
          </div>
        ) : null}
        {h.gamAtivo ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, maxWidth: 420 }}>
            <div style={{ flex: 1 }}><Segs n={20} lit={h.xpNivelMax > 0 ? Math.round(20 * ringP) : 0} h={7} /></div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{h.xpNivelAtual}/{h.xpNivelMax} XP</span>
          </div>
        ) : null}
      </div>
    </div>
  )
  return <div className="card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow, 0 10px 30px -18px rgba(0,0,0,.25))' }}>{banner}{who}</div>
}

function LvlRing({ size, p, inner }: { size: number; p: number; inner: React.ReactNode }) {
  const r = (size - 8) / 2, C = 2 * Math.PI * r
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-flex', flexShrink: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={4} />
        <circle className="pmq-ring" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#5ECEF0" strokeWidth={4} strokeLinecap="round" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - p)).toFixed(1)} style={{ ['--c' as any]: C.toFixed(1) }} />
      </svg>
      <span style={{ position: 'absolute', inset: 8, display: 'flex' }}>{inner}</span>
    </span>
  )
}

// ---------------------------------------------------------------- KPI strip (6)
function Kpis({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const k = data.kpis
  const items: [string, string][] = [
    [String(k.simuladosFeitos), 'Simulados'],
    [k.notaMedia == null ? DASH : fnum(k.notaMedia), 'Nota média'],
    [k.acertoMedio == null ? DASH : `${Math.round(k.acertoMedio)}%`, 'Acerto'],
    [k.tempoMedioMin == null ? DASH : `${k.tempoMedioMin} min`, 'Tempo médio'],
    [k.melhorNota == null ? DASH : fnum(k.melhorNota), 'Melhor nota'],
    [k.xpMes == null ? DASH : String(k.xpMes), 'XP no mês'],
  ]
  return bk.card(
    <div className="pmq-kpis">
      {items.map(([v, l], k) => (
        <div key={l} style={{ padding: mobile ? '8px 0' : '0 16px', borderLeft: mobile || k === 0 ? undefined : '1px solid var(--line)' }}>{cap(l)}<b style={{ display: 'block', marginTop: 2, fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{v}</b></div>
      ))}
    </div>, 20, { padding: '16px 20px' })
}

// ---------------------------------------------------------------- Resumo (perfil de estudo + Lei Seca)
function PerfilBox({ data }: { data: PerfilData }) {
  const h = data.header
  const rows: [string, string | null][] = [
    ['Matéria mais forte', data.matForte],
    ['Matéria a reforçar', data.matReforcar],
    ['Foco', h.foco],
    ['Na plataforma desde', h.memberSince],
  ]
  return bk.card(<>
    {bk.head('user', 'Perfil de estudo')}
    {rows.filter(([, v]) => v).map(([l, v], k) => (
      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: k ? '1px solid var(--line)' : undefined }}>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{l}</span><b style={{ fontSize: 12.5, color: 'var(--ink)', textAlign: 'right' }}>{v}</b>
      </div>
    ))}
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, padding: '9px 10px', borderRadius: 9, background: 'var(--surface2)', fontSize: 11.5, color: 'var(--muted)' }}><Ic n="lock" s={13} />Dados pessoais ficam só nas configurações da conta.</div>
  </>)
}

function LeiSecaBox({ data }: { data: PerfilData }) {
  if (!data.leiSeca.length) return null
  return bk.card(<>
    {bk.head('books', 'Meu Desafio de Lei Seca')}
    {data.leiSeca.map(({ lei, feitas, total }, k) => {
      const p = total > 0 ? Math.round(100 * feitas / total) : 0
      return (
        <div key={lei} style={{ padding: '9px 0', borderTop: k ? '1px solid var(--line)' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}><b style={{ color: 'var(--ink)' }}>{lei}</b><span style={{ color: 'var(--muted)' }}>{feitas}/{total} aulas</span></div>
          <Segs n={20} lit={Math.round(p / 5)} h={6} />
        </div>
      )
    })}
    <div style={{ marginTop: 14 }}>
      <Link href={data.trilhaHref} style={{ textDecoration: 'none' }}>{bk.btn('Ir para a trilha', 'play', 'primary', 38, true)}</Link>
    </div>
  </>)
}

function TabResumo({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const [prefs, setPrefs] = useState<PerfilPreferencias | null>(data.preferencias ?? null)
  const [meta, setMeta] = useState<number>(data.metaDiaria?.meta ?? 20)
  const [saving, startSave] = useTransition()
  const persistir = (patch: Record<string, unknown>) => startSave(async () => { try { await salvarPerfilPrefs(patch as any) } catch { /* best-effort */ } })
  const onMeta = (m: number) => { setMeta(m); persistir({ metaDiaria: m }) }
  const onToggle = (k: keyof PerfilPreferencias) => { if (!prefs) return; const nv = { ...prefs, [k]: !prefs[k] }; setPrefs(nv); persistir({ [k]: nv[k] }) }

  const lei = <LeiSecaBox data={data} />
  const metaCard = data.metaDiaria ? <MetaDiariaCard bk={bk} meta={meta} feitas={data.metaDiaria.feitas} onMeta={onMeta} saving={saving} /> : null
  const resumo = data.resumoSemana ? <ResumoSemanaCard bk={bk} r={data.resumoSemana} /> : null
  const prefsCard = prefs ? <PreferenciasCard bk={bk} prefs={prefs} onToggle={onToggle} saving={saving} /> : null
  if (mobile) return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><PerfilBox data={data} />{metaCard}{lei}{resumo}{prefsCard}</div>
  const colStyle = { display: 'flex', flexDirection: 'column' as const, gap: 16 }
  return (
    <div className="pmq-info3">
      <div style={colStyle}><PerfilBox data={data} /></div>
      <div style={colStyle}>{metaCard}{lei}</div>
      <div style={colStyle}>{resumo}{prefsCard}</div>
    </div>
  )
}

// ---------------------------------------------------------------- Desempenho (disciplina + evolução)
function DiscCard({ data }: { data: PerfilData }) {
  const cols = 'minmax(0,1.2fr) 1fr 44px'
  return bk.card(<>
    {bk.head('list', 'Acerto por disciplina', <span style={{ fontSize: 12, color: 'var(--muted)' }}>{data.porDisciplina.length} matérias</span>)}
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '0 4px 8px', borderBottom: '1px solid var(--line)' }}>{['Matéria', 'Você × turma', 'Acerto'].map((hh) => <span key={hh} style={{ textAlign: hh === 'Acerto' ? 'right' : undefined }}>{cap(hh)}</span>)}</div>
    {data.porDisciplina.map(({ nome, aluno, turma }) => {
      const [ac] = notec(aluno)
      return (
        <div key={nome} style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', padding: '9px 4px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nome}</span>
          <div style={{ position: 'relative' }}>
            <Segs n={20} lit={Math.round(aluno / 5)} h={6} on={ac} />
            <span title={`Turma: ${turma}%`} style={{ position: 'absolute', top: -3, bottom: -3, left: `calc(${Math.min(100, Math.max(0, turma))}% - 1px)`, width: 2, background: 'var(--ink)', opacity: 0.5, borderRadius: 2 }} />
          </div>
          <b style={{ textAlign: 'right', fontSize: 12.5, color: ac }}>{aluno}%</b>
        </div>
      )
    })}
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
      <span style={{ width: 2, height: 12, background: 'var(--ink)', opacity: 0.5, borderRadius: 2 }} />Marcador = média da turma (anônima)
    </div>
  </>)
}

function EvoCard({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const w = mobile ? 360 : 640, h = mobile ? 150 : 190
  const vals = data.evolucao.map((e) => e.nota)
  const labels = data.evolucao.map((e) => (e.rotulo.includes('/') ? e.rotulo.split('/').slice(0, 2).join('/') : e.rotulo)) // "DD/MM"
  const chartMin = Math.max(260, vals.length * 46) // rolamento horizontal quando há muitos pontos
  return bk.card(<>
    {bk.head('trend', 'Evolução da nota', undefined, 'Nota média por período')}
    {vals.length === 0 ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>Sem dados de evolução ainda.</span> : (
      <div className="pmq-pv" style={{ overflowX: 'auto', maxWidth: '100%' }}><div style={{ minWidth: chartMin }}><BarsSvg vals={vals} labels={labels} w={w} h={h} color="var(--brand2)" rad={4} /></div></div>
    )}
  </>)
}

function TabDesemp({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const kpis = data.estatKpis && data.estatKpis.length ? <EstatKpiStrip bk={bk} kpis={data.estatKpis} /> : null
  const voce = data.voceXmedia && data.voceXmedia.length ? <VoceMediaCard bk={bk} rows={data.voceXmedia} /> : null
  const banca = data.porBanca ? <BancaCard bk={bk} b={data.porBanca} /> : null
  const ff = data.fortesFracos ? <FortesFracosCard bk={bk} ff={data.fortesFracos} /> : null
  const rend = data.rendimentoHora ? <RendimentoHoraCard bk={bk} r={data.rendimentoHora} /> : null
  const tempo = data.tempoPorQuestao ? <TempoQuestaoCard bk={bk} t={data.tempoPorQuestao} /> : null
  if (mobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {kpis}<EvoCard mobile data={data} />{voce}<DiscCard data={data} />{banca}{ff}{rend}{tempo}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {kpis}
      {voce ? <div className="pmq-est"><EvoCard mobile={false} data={data} />{voce}</div> : <EvoCard mobile={false} data={data} />}
      <div className="pmq-est3"><DiscCard data={data} />{banca}{ff}</div>
      {(rend || tempo) ? <div className="pmq-est">{rend}{tempo}</div> : null}
    </div>
  )
}

// ---------------------------------------------------------------- Simulados (histórico)
function TabSims({ data }: { mobile: boolean; data: PerfilData }) {
  return <HistoricoTabela bk={bk} hist={data.historico} />
}

// ---------------------------------------------------------------- Selos (conquistas)
function TabSelos({ mobile, data }: { mobile: boolean; data: PerfilData }) {
  const total = data.conquistas.length
  const got = data.conquistas.filter((a) => a.desbloqueada)
  const todo = data.conquistas.filter((a) => !a.desbloqueada)
  if (mobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {bk.card(<>
          {bk.head('shield', 'Selos conquistados', <b style={{ fontSize: 13, color: 'var(--brand2)' }}>{got.length}/{total}</b>)}
          {got.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{got.map((a, k) => <span key={k} title={a.titulo} style={{ width: 40, height: 40, borderRadius: 9, background: 'linear-gradient(150deg,#1F2A55,#306AB5)', color: '#8BEAEA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="shield" s={18} /></span>)}</div> : <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nenhum selo ainda.</span>}
        </>, 16)}
        {todo.length ? bk.card(<>
          {bk.head('clock', 'A conquistar')}
          {todo.map((a, k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderTop: k ? '1px solid var(--line)' : undefined }}>
              <span style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--surface2)', color: 'var(--brand2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="lock" s={17} /></span>
              <div style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{a.titulo}</b>{a.criterio ? <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{a.criterio}</span> : null}</div>
            </div>
          ))}
        </>, 16) : null}
      </div>
    )
  }
  const cols = '44px minmax(0,1.5fr) minmax(0,2fr) 110px'
  return bk.card(<>
    {bk.head('shield', 'Selos', <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand2)' }}>{got.length} de {total}</span>)}
    {total === 0 ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhum selo ainda.</span> : (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '0 8px 10px', borderBottom: '1px solid var(--line)' }}>{['', 'Selo', 'Critério', 'Status'].map((hh, i) => <span key={i}>{cap(hh)}</span>)}</div>
        {data.conquistas.map((a, k) => {
          const on = a.desbloqueada
          return (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, alignItems: 'center', padding: '9px 8px', borderBottom: '1px solid var(--line)' }}>
              <span style={{ width: 38, height: 38, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...(on ? { background: 'linear-gradient(150deg,#1F2A55,#306AB5)', color: '#8BEAEA' } : { background: 'var(--surface2)', color: 'var(--muted)', border: '1px dashed var(--line2)' }) }}><Ic n={on ? 'shield' : 'lock'} s={17} /></span>
              <b style={{ fontSize: 13, fontWeight: 600, color: on ? 'var(--ink)' : 'var(--muted)' }}>{a.titulo}</b>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{a.criterio || ''}</span>
              {on
                ? <span style={{ justifySelf: 'start', height: 24, padding: '0 9px', borderRadius: 6, background: 'rgba(46,199,122,.14)', color: '#2EC77A', fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>Obtido</span>
                : <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Bloqueado</span>}
            </div>
          )
        })}
      </>
    )}
  </>, 18)
}

const CSS = `
/* Adapta ao CONTAINER real (Curseduca/sidebar/tablet), não ao viewport. */
.pmq-wrap{container-type:inline-size;overflow-x:clip;max-width:100%}
.pmq-wrap .card{min-width:0;max-width:100%}
.pmq-est>*,.pmq-est3>*,.pmq-info3>*,.pmq-2col>*{min-width:0}
.pmq-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,120px),1fr));gap:4px 8px}
.pmq-2col{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:16px;align-items:start}
.pmq-est{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:16px;align-items:start}
.pmq-info3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;align-items:start}
.pmq-est3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;align-items:start}
@container (max-width:720px){.pmq-2col,.pmq-est{grid-template-columns:1fr}}
@container (max-width:980px){.pmq-info3,.pmq-est3{grid-template-columns:1fr 1fr}}
@container (max-width:640px){.pmq-info3,.pmq-est3{grid-template-columns:1fr}}
.pmq-pv{animation:pmqpv .45s cubic-bezier(.22,1,.36,1) both}
@keyframes pmqpv{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.ptab{transition:background .25s,color .25s}
.pmq-ring{animation:pmqring 1.4s cubic-bezier(.22,1,.36,1) both}
@keyframes pmqring{from{stroke-dashoffset:var(--c)}}
.pseg{animation:pmqseg .5s ease-out both}@keyframes pmqseg{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
.pgrow{transform-box:fill-box;transform-origin:center bottom;animation:pmqgrow .9s cubic-bezier(.22,1,.36,1) both}
@keyframes pmqgrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.pln{stroke-dasharray:1200;stroke-dashoffset:1200;animation:pmqln 1.2s ease-out .3s forwards}
@keyframes pmqln{to{stroke-dashoffset:0}}
.pmq-pl{stroke-dasharray:46 954;stroke-dashoffset:1000;opacity:0;animation:pmqplf .6s ease-out 2.6s forwards,pmqpulse 9s linear 2.6s infinite}
@keyframes pmqplf{to{opacity:1}}@keyframes pmqpulse{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){
  .pmq-ring,.pseg,.pgrow,.pmq-pl{animation:none!important}
  .pgrow{transform:none}.pmq-pl{opacity:0}
  .pln{stroke-dashoffset:0!important;animation:none!important}
}
`

export function PerfilMeq({ theme: themeProp, data }: { theme: InternaTheme; data: PerfilData }) {
  const theme = useTemaInterno(themeProp)
  const [pf, setPf] = useState('info')
  const mobile = useIsMobile()
  return (
    <div style={{ ...internaTokensStyle('meq', theme), ['--r' as any]: `${INTERNA_RADIUS.meq}px`, minHeight: '100%', background: 'var(--bg)' }}>
      {/* MEQ usa Sora (não carregada globalmente) — como em loading-meq-circuito */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap" />
      <style>{CSS + PERFIL_BLOCOS_CSS}</style>
      <div className="pmq-wrap" style={{ padding: mobile ? '18px 16px 28px' : '24px 32px 48px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Header mobile={mobile} data={data} />
        <Kpis mobile={mobile} data={data} />
        <div><Tabs bk={bk} tabs={TABS} active={pf} onPick={setPf} mobile={mobile} /></div>
        <div className="pmq-pv" key={pf}>
          {pf === 'info' && <TabResumo mobile={mobile} data={data} />}
          {pf === 'est' && <TabDesemp mobile={mobile} data={data} />}
          {pf === 'hist' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {data.atividade ? <AtividadeHeatmap bk={bk} a={data.atividade} /> : null}
              <TabSims mobile={mobile} data={data} />
            </div>
          )}
          {pf === 'conq' && <TabSelos mobile={mobile} data={data} />}
        </div>
      </div>
    </div>
  )
}
