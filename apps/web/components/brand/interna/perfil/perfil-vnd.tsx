'use client'

// Perfil — VND (spec 05 §1.2/§1.5, gamificado). Banner verde pontilhado+chevrons, anéis KPI,
// abas Visão geral/Conquistas/Histórico/Desempenho. Prefixo CSS `pvn-`.
// DADOS REAIS (PerfilData): renderiza só seções com fonte real; nada de botão/toggle inerte.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { internaTokensStyle, INTERNA_RADIUS, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import { BK, Ic, Tabs, type TabDef, notec, fnum, LineSvg } from './shared'
import { useIsMobile } from './use-is-mobile'
import type { PerfilData, PerfilPreferencias } from './data'
import { salvarPerfilPrefs } from '@/app/aluno/(portal)/perfil/actions'
import {
  MetaDiariaCard, PreferenciasCard, ResumoSemanaCard, AtividadeHeatmap, EstatKpiStrip,
  VoceMediaCard, BancaCard, FortesFracosCard, RendimentoHoraCard, TempoQuestaoCard, HistoricoTabela, PERFIL_BLOCOS_CSS,
} from './blocos'

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
  return (
    <div className="pvn-kpis">
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
  const [prefs, setPrefs] = useState<PerfilPreferencias | null>(data.preferencias ?? null)
  const [meta, setMeta] = useState<number>(data.metaDiaria?.meta ?? 20)
  const [saving, startSave] = useTransition()
  const persistir = (patch: Record<string, unknown>) => startSave(async () => { try { await salvarPerfilPrefs(patch as any) } catch { /* best-effort */ } })
  const onMeta = (m: number) => { setMeta(m); persistir({ metaDiaria: m }) }
  const onToggle = (k: keyof PerfilPreferencias) => { if (!prefs) return; const nv = { ...prefs, [k]: !prefs[k] }; setPrefs(nv); persistir({ [k]: nv[k] }) }

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

  const metaCard = data.metaDiaria ? <MetaDiariaCard bk={bk} meta={meta} feitas={data.metaDiaria.feitas} onMeta={onMeta} saving={saving} /> : null
  const resumo = data.resumoSemana ? <ResumoSemanaCard bk={bk} r={data.resumoSemana} /> : null
  const prefsCard = prefs ? <PreferenciasCard bk={bk} prefs={prefs} onToggle={onToggle} saving={saving} /> : null

  if (mobile) return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{dados}{metaCard}{lei}{resumo}{prefsCard}</div>
  const colStyle = { display: 'flex', flexDirection: 'column' as const, gap: 16 }
  return (
    <div className="pvn-info3">
      <div style={colStyle}>{dados}</div>
      <div style={colStyle}>{metaCard}{lei}</div>
      <div style={colStyle}>{resumo}{prefsCard}</div>
    </div>
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

// ---------------------------------------------------------------- Histórico (tabela ordenável + rolagem)
function TabHist({ data }: { mobile: boolean; data: PerfilData }) {
  const hist = data.historico
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {data.atividade ? <AtividadeHeatmap bk={bk} a={data.atividade} /> : null}
      <HistoricoTabela bk={bk} hist={hist} />
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
  const labels = data.evolucao.map((e) => (e.rotulo.includes('/') ? e.rotulo.split('/').slice(0, 2).join('/') : e.rotulo)) // "DD/MM"
  const chartMin = Math.max(260, vals.length * 46) // rolamento horizontal quando há muitos pontos
  return bk.card(<>
    {bk.head('trend', 'Evolução da nota', undefined, 'Nota média por período')}
    {vals.length === 0 ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>Sem dados de evolução ainda.</span> : (
      <div className="pvn-pv" style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <div style={{ minWidth: chartMin }}>
        <LineSvg vals={vals} w={w} h={h} color="var(--brand)" fill="var(--chip)" />
        <div style={{ display: 'flex', marginTop: 6 }}>{labels.map((m, i) => <span key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m}</span>)}</div>
        </div>
      </div>
    )}
  </>)
}

function TabEst({ mobile, data }: { mobile: boolean; data: PerfilData }) {
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
      {voce ? <div className="pvn-est"><EvoCard mobile={false} data={data} />{voce}</div> : <EvoCard mobile={false} data={data} />}
      <div className="pvn-est3"><DiscCard data={data} />{banca}{ff}</div>
      {(rend || tempo) ? <div className="pvn-est">{rend}{tempo}</div> : null}
    </div>
  )
}

const CSS = `
/* Adapta ao CONTAINER real (Curseduca/sidebar/tablet), não ao viewport. */
.pvn-wrap{container-type:inline-size;overflow-x:clip;max-width:100%}
.pvn-wrap .card{min-width:0;max-width:100%}
.pvn-est>*,.pvn-est3>*,.pvn-info3>*{min-width:0}
.pvn-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,200px),1fr));gap:12px}
.pvn-2col{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.pvn-est{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:16px;align-items:start}
.pvn-info3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;align-items:start}
.pvn-est3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;align-items:start}
@container (max-width:720px){.pvn-2col,.pvn-est{grid-template-columns:1fr}}
@container (max-width:980px){.pvn-info3,.pvn-est3{grid-template-columns:1fr 1fr}}
@container (max-width:640px){.pvn-info3,.pvn-est3{grid-template-columns:1fr}}
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
      <style>{CSS + PERFIL_BLOCOS_CSS}</style>
      <Header mobile={mobile} data={data} />
      <div className="pvn-wrap" style={{ padding: mobile ? '18px 18px 28px' : '24px 32px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>{body}</div>
    </div>
  )
}
