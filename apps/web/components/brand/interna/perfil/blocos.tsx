'use client'

// Blocos ricos do Perfil (spec 05) COMPARTILHADOS pelas 3 marcas. Cada componente recebe o adaptador
// de marca `bk` (BK) — card/head/bar já saem no estilo da marca (Revisão/VND/MEQ) + tokens de cor.
// Dado real via PerfilData; renderizados só quando o bloco existe (a tela decide).

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { BK, Ic, notec, fnum, Donut, Spark, delta, Toggle } from './shared'
import type { PerfilData, PerfilPreferencias } from './data'

const fmtHoras = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min` }

// ── Meta diária (interativa) ──
export function MetaDiariaCard({ bk, meta, feitas, onMeta, saving }: { bk: BK; meta: number; feitas: number; onMeta: (m: number) => void; saving: boolean }) {
  const pct = meta > 0 ? Math.min(100, Math.round((feitas / meta) * 100)) : 0
  return bk.card(<>
    {bk.head('target', 'Meta diária', <b style={{ fontSize: 14, color: 'var(--ink)' }}>{feitas} / {meta}</b>)}
    {bk.bar(pct, undefined, 8)}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 14 }}>
      {[10, 20, 40, 60].map((m) => (
        <button key={m} type="button" disabled={saving} onClick={() => onMeta(m)} style={{ height: 34, borderRadius: 10, border: '1px solid var(--line)', background: m === meta ? bk.acc : 'transparent', color: m === meta ? '#FFF' : 'var(--ink)', font: 'inherit', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>{m}</button>
      ))}
    </div>
    <span style={{ display: 'block', marginTop: 8, fontSize: 11.5, color: 'var(--muted)' }}>questões por dia</span>
  </>)
}

const PREFS_DEF: { key: keyof PerfilPreferencias; titulo: string; sub: string }[] = [
  { key: 'lembrete', titulo: 'Lembrete diário', sub: 'Às 19:00, se não estudou' },
  { key: 'resumoSemanal', titulo: 'Resumo semanal', sub: 'Toda segunda-feira' },
  { key: 'aparecerRanking', titulo: 'Aparecer no ranking', sub: 'Sempre de forma anônima' },
  { key: 'modoFoco', titulo: 'Modo foco', sub: 'Esconde XP durante simulados' },
]
export function PreferenciasCard({ bk, prefs, onToggle, saving }: { bk: BK; prefs: PerfilPreferencias; onToggle: (k: keyof PerfilPreferencias) => void; saving: boolean }) {
  return bk.card(<>
    {bk.head('sliders', 'Preferências')}
    {PREFS_DEF.map((p, i) => (
      <button key={p.key} type="button" disabled={saving} onClick={() => onToggle(p.key)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', padding: '12px 0', border: 0, borderTop: i ? '1px solid var(--line)' : undefined, background: 'transparent', cursor: saving ? 'default' : 'pointer', textAlign: 'left' }}>
        <span style={{ minWidth: 0 }}><b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)' }}>{p.titulo}</b><span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{p.sub}</span></span>
        <Toggle on={prefs[p.key]} acc={bk.acc} />
      </button>
    ))}
  </>)
}

export function ResumoSemanaCard({ bk, r }: { bk: BK; r: NonNullable<PerfilData['resumoSemana']> }) {
  const stats: [string, string, React.ReactNode][] = [
    ['Questões', String(r.questoes), r.questoesDeltaPct != null ? delta(`${r.questoesDeltaPct >= 0 ? '+' : ''}${r.questoesDeltaPct}%`, r.questoesDeltaPct >= 0) : null],
    ['Simulados', String(r.simulados), r.simuladosDelta != null ? delta(`${r.simuladosDelta >= 0 ? '+' : ''}${r.simuladosDelta}`, r.simuladosDelta >= 0) : null],
    ['Tempo de estudo', fmtHoras(r.tempoMin), r.tempoDeltaMin != null ? delta(`${r.tempoDeltaMin >= 0 ? '+' : '−'}${fmtHoras(Math.abs(r.tempoDeltaMin))}`, r.tempoDeltaMin >= 0) : null],
    ['Acerto', `${r.acerto}%`, r.acertoDeltaPp != null ? delta(`${r.acertoDeltaPp >= 0 ? '+' : ''}${r.acertoDeltaPp} pp`, r.acertoDeltaPp >= 0) : null],
  ]
  const mx = Math.max(1, ...r.dias.map((d) => d.valor))
  return bk.card(<>
    {bk.head('chart', 'Resumo da semana', <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>vs. semana passada</span>)}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {stats.map(([l, v, d]) => (
        <div key={l} style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--surface2)' }}>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}><b style={{ fontSize: 17, color: 'var(--ink)' }}>{v}</b>{d}</div>
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 54, marginTop: 14 }}>
      {r.dias.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ width: '100%', height: 38, display: 'flex', alignItems: 'flex-end' }}><span style={{ width: '100%', height: `${Math.max(5, (d.valor / mx) * 100)}%`, borderRadius: 4, background: d.valor ? bk.acc : 'var(--track)' }} /></div>
          <span style={{ fontSize: 9.5, color: 'var(--muted)' }}>{d.label[0]}</span>
        </div>
      ))}
    </div>
  </>)
}

export function AtividadeHeatmap({ bk, a }: { bk: BK; a: NonNullable<PerfilData['atividade']> }) {
  const mapa = new Map(a.dias.map((d) => [d.data, d.nivel]))
  const hoje = new Date()
  const diaSem = (hoje.getDay() + 6) % 7
  const fimSemana = new Date(hoje.getTime() + (6 - diaSem) * 86400000)
  const cols: { data: string; nivel: number }[][] = []
  let cur = new Date(fimSemana.getTime() - (26 * 7 - 1) * 86400000)
  for (let w = 0; w < 26; w++) {
    const col: { data: string; nivel: number }[] = []
    for (let d = 0; d < 7; d++) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
      col.push({ data: key, nivel: cur.getTime() > hoje.getTime() + 86400000 ? -1 : (mapa.get(key) ?? 0) })
      cur = new Date(cur.getTime() + 86400000)
    }
    cols.push(col)
  }
  const cor = (n: number) => (n < 0 ? 'transparent' : n === 0 ? 'var(--track)' : `color-mix(in oklab, ${bk.acc} ${n * 22 + 12}%, transparent)`)
  return bk.card(<>
    {bk.head('cal', 'Atividade de estudo', <span style={{ fontSize: 12, color: 'var(--muted)' }}>{a.totalDias} dias estudados nos últimos 6 meses</span>)}
    <div style={{ display: 'flex', gap: 3, overflowX: 'auto', paddingBottom: 4 }}>
      {cols.map((col, ci) => (
        <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
          {col.map((c, ri) => <span key={ri} title={c.data} style={{ width: 13, height: 13, borderRadius: 3, background: cor(c.nivel) }} />)}
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
      Menos {[0, 1, 2, 3, 4].map((n) => <span key={n} style={{ width: 11, height: 11, borderRadius: 3, background: cor(n) }} />)} Mais
    </div>
  </>)
}

export function EstatKpiStrip({ bk, kpis }: { bk: BK; kpis: NonNullable<PerfilData['estatKpis']> }) {
  return (
    <div className="perfilblk-estk">
      {kpis.map((k, i) => (
        <div key={i} style={{ padding: '14px 16px', borderRadius: bk.cardRad - 4, background: 'var(--surface)', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{k.label}</span>
          <b style={{ display: 'block', marginTop: 4, fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{k.valor}</b>
          {k.delta ? <div style={{ marginTop: 2 }}>{delta(k.delta, k.good)}</div> : null}
          {k.serie.length > 1 ? <div style={{ marginTop: 8 }}><Spark vals={k.serie} color={bk.acc} w={120} h={28} /></div> : null}
        </div>
      ))}
    </div>
  )
}

function DuplaBar({ label, v, mx, cor, suf }: { label: string; v: number; mx: number; cor: string; suf?: string }) {
  // Larguras fixas no rótulo e no valor (flex-shrink:0) + barra flexível com min-width:0 → nunca estoura.
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '3px 0', width: '100%', maxWidth: '100%' }}>
      <span style={{ width: 40, flexShrink: 0, fontSize: 11, color: 'var(--muted)' }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0, height: 8, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${Math.min(100, (v / mx) * 100)}%`, height: '100%', borderRadius: 99, background: cor }} /></div>
      <b style={{ width: 52, flexShrink: 0, textAlign: 'right', fontSize: 12, color: 'var(--ink)' }}>{fnum(v).replace(',0', '')}{suf ?? ''}</b>
    </div>
  )
}
export function VoceMediaCard({ bk, rows }: { bk: BK; rows: NonNullable<PerfilData['voceXmedia']> }) {
  return bk.card(<>
    {bk.head('users', 'Você x média dos alunos', undefined, 'Comparação anônima e agregada')}
    {rows.map((r, i) => {
      const mx = Math.max(r.voce, r.media, 1)
      return (
        <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--line)' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginBottom: 4 }}><b style={{ color: 'var(--ink)' }}>{r.label}</b>{r.melhor ? delta('melhor que a média', true) : delta('abaixo da média', false)}</div>
          <DuplaBar label="Você" v={r.voce} mx={mx} cor={bk.acc} suf={r.sufixo} />
          <DuplaBar label="Média" v={r.media} mx={mx} cor={`color-mix(in oklab, ${bk.acc} 35%, var(--track))`} suf={r.sufixo} />
        </div>
      )
    })}
  </>)
}

export function BancaCard({ bk, b }: { bk: BK; b: NonNullable<PerfilData['porBanca']> }) {
  const total = b.acertos + b.erros + b.brancos
  return bk.card(<>
    {bk.head('layers', 'Acerto por banca')}
    {b.bancas.map((bb) => { const [c] = notec(bb.acerto); return (
      <div key={bb.nome} style={{ display: 'grid', gridTemplateColumns: '84px 1fr 72px', alignItems: 'center', gap: 10, padding: '5px 0' }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bb.nome}</span>
        <div>{bk.bar(Math.max(bb.acerto, 1), c, 7)}</div>
        <span style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--muted)' }}><b style={{ color: c }}>{bb.acerto}%</b> · {bb.total}q</span>
      </div>
    ) })}
    {total > 0 && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
        <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
          <Donut parts={[[b.acertos / total, '#1FA868'], [b.erros / total, '#E5484D'], [b.brancos / total, 'var(--track)']]} size={84} sw={11} />
          <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1 }}><b style={{ fontSize: 14, color: 'var(--ink)' }}>{total.toLocaleString('pt-BR')}</b><span style={{ fontSize: 9, color: 'var(--muted)' }}>respostas</span></span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          {([['#1FA868', 'Acertos', b.acertos], ['#E5484D', 'Erros', b.erros], ['var(--track)', 'Em branco', b.brancos]] as [string, string, number][]).map(([c, l, v]) => (
            <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />{l} <b style={{ color: 'var(--ink)' }}>{v.toLocaleString('pt-BR')}</b></span>
          ))}
        </div>
      </div>
    )}
  </>)
}

export function FortesFracosCard({ bk, ff }: { bk: BK; ff: NonNullable<PerfilData['fortesFracos']> }) {
  const Linha = ({ nome, pct, c }: { nome: string; pct: number; c: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0' }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nome}</span>
      <b style={{ fontSize: 12.5, color: c }}>{pct}%</b>
    </div>
  )
  return bk.card(<>
    {bk.head('trend', 'Fortes e fracos', undefined, 'Do seu acerto por disciplina')}
    <span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: '#1FA868', marginBottom: 2 }}>PONTOS FORTES</span>
    {ff.fortes.map((d) => <Linha key={d.nome} nome={d.nome} pct={d.pct} c="#1FA868" />)}
    <span style={{ display: 'block', marginTop: 12, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: '#E5484D', marginBottom: 2 }}>PARA REFORÇAR</span>
    {ff.fracos.map((d) => <Linha key={d.nome} nome={d.nome} pct={d.pct} c="#E5484D" />)}
  </>)
}

export function RendimentoHoraCard({ bk, r }: { bk: BK; r: NonNullable<PerfilData['rendimentoHora']> }) {
  const cor = (v: number) => (v < 0 ? 'var(--surface2)' : `color-mix(in oklab, ${bk.acc} ${Math.max(8, v)}%, transparent)`)
  return bk.card(<>
    {bk.head('clock', 'Quando você rende mais', undefined, 'Acerto por dia da semana e horário')}
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `44px repeat(${r.slots.length},minmax(40px,1fr))`, gap: 4, minWidth: 360 }}>
        <span />
        {r.slots.map((s) => <span key={s} style={{ fontSize: 9.5, color: 'var(--muted)', textAlign: 'center' }}>{s}</span>)}
        {r.dias.map((d, di) => (
          <Fragment key={d}>
            <span style={{ fontSize: 10.5, color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>{d}</span>
            {r.slots.map((_, si) => { const v = r.matriz[di][si]; return <span key={si} title={v < 0 ? 'sem dados' : `${v}%`} style={{ height: 24, borderRadius: 5, background: cor(v) }} /> })}
          </Fragment>
        ))}
      </div>
    </div>
    {r.insight ? <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--surface2)', fontSize: 12, color: 'var(--muted)' }}><Ic n="bulb" s={14} c={bk.acc} /><span>{r.insight}</span></div> : null}
  </>)
}

export function TempoQuestaoCard({ bk, t }: { bk: BK; t: NonNullable<PerfilData['tempoPorQuestao']> }) {
  const fmt = (s: number | null) => (s == null ? '—' : s >= 60 ? `${Math.floor(s / 60)}min ${String(Math.round(s % 60)).padStart(2, '0')}s` : `${s}s`)
  const rows: [string, string, string?][] = [
    ['Média geral', fmt(t.geralSeg)],
    ['Quando acerta', fmt(t.acertaSeg)],
    ['Quando erra', fmt(t.erraSeg)],
  ]
  if (t.lenta) rows.push(['Matéria mais lenta', fmt(t.lenta.seg), t.lenta.nome])
  if (t.rapida) rows.push(['Matéria mais rápida', fmt(t.rapida.seg), t.rapida.nome])
  return bk.card(<>
    {bk.head('clock', 'Tempo por questão')}
    {rows.map(([l, v, extra], i) => (
      <div key={l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderTop: i ? '1px solid var(--line)' : undefined }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{l}{extra ? <span style={{ color: 'var(--muted)' }}> · {extra}</span> : null}</span>
        <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{v}</b>
      </div>
    ))}
  </>)
}

// ── Histórico de simulados: ordenável por coluna (padrão Data ↓) + rolagem com altura de 10 linhas. ──
type HistItem = PerfilData['historico'][number]
type HistKey = 'simulado' | 'data' | 'nota' | 'acerto' | 'tempo'
const ROW_H = 46
function parseDataBR(q: string): number { const m = q.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/); if (!m) return 0; const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : 2000; return new Date(y, Number(m[2]) - 1, Number(m[1])).getTime() }
function parseTempoMin(t: string): number { const h = /(\d+)\s*h/.exec(t); const mi = /(\d+)\s*min/.exec(t); if (!h && !mi) { const n = /(\d+)/.exec(t); return n ? Number(n[1]) : 0 } return (h ? Number(h[1]) * 60 : 0) + (mi ? Number(mi[1]) : 0) }

export function HistoricoTabela({ bk, hist }: { bk: BK; hist: HistItem[] }) {
  const [sortKey, setSortKey] = useState<HistKey>('data')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const onSort = (k: HistKey) => { if (k === sortKey) { setDir((d) => (d === 'asc' ? 'desc' : 'asc')) } else { setSortKey(k); setDir(k === 'simulado' ? 'asc' : 'desc') } }
  const val = (it: HistItem): number | string => {
    switch (sortKey) {
      case 'simulado': return it.simulado.toLowerCase()
      case 'data': return parseDataBR(it.quando)
      case 'nota': return it.nota ?? -1
      case 'acerto': return it.acerto
      case 'tempo': return parseTempoMin(it.tempo)
    }
  }
  const sorted = [...hist].sort((a, b) => { const va = val(a), vb = val(b); const c = va < vb ? -1 : va > vb ? 1 : 0; return dir === 'asc' ? c : -c })
  const cols = 'minmax(0,2.2fr) 0.95fr 0.7fr 1.2fr 0.85fr'
  const SortTh = ({ k, label, right }: { k: HistKey; label: string; right?: boolean }) => (
    <button type="button" onClick={() => onSort(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: right ? 'flex-end' : 'flex-start', width: '100%', border: 0, background: 'transparent', color: sortKey === k ? 'var(--ink)' : 'var(--muted)', font: 'inherit', fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', cursor: 'pointer', padding: 0, minWidth: 0 }}>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>{sortKey === k ? <Ic n={dir === 'asc' ? 'up' : 'down'} s={11} sw={3} /> : null}
    </button>
  )
  return bk.card(<>
    {bk.head('clock', 'Histórico de simulados', <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{hist.length} registros</span>)}
    {hist.length === 0 ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhum simulado realizado ainda.</span> : (
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 480 }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '0 10px 8px', borderBottom: '1px solid var(--line)' }}>
            <SortTh k="simulado" label="Simulado" />
            <SortTh k="data" label="Data" />
            <SortTh k="nota" label="Nota" />
            <SortTh k="acerto" label="Acerto" />
            <SortTh k="tempo" label="Tempo" />
          </div>
          <div style={{ height: ROW_H * 10, overflowY: 'auto' }}>
            {sorted.map((item, k) => {
              const n = item.nota
              const [fg, bg] = n == null ? ['var(--muted)', 'var(--surface2)'] : notec(n)
              const [af] = notec(item.acerto)
              const inner = (
                <div className="perfilblk-rowh" style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', gap: 12, padding: '0 10px', height: ROW_H, borderBottom: '1px solid var(--line)' }}>
                  <b style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{item.simulado}</b>
                  <span style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{item.quando}</span>
                  <span style={{ justifySelf: 'start', height: 24, padding: '0 9px', borderRadius: 7, background: bg, color: fg, fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>{n == null ? '—' : fnum(n)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><div style={{ flex: 1, minWidth: 0 }}>{bk.bar(item.acerto, af, 6)}</div><span style={{ width: 34, fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{item.acerto}%</span></div>
                  <span style={{ fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{item.tempo}</span>
                </div>
              )
              return item.href ? <Link key={k} href={item.href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{inner}</Link> : <div key={k}>{inner}</div>
            })}
          </div>
        </div>
      </div>
    )}
  </>)
}

// CSS compartilhado dos blocos (grids adaptáveis ao container).
export const PERFIL_BLOCOS_CSS = `
.perfilblk-estk{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,170px),1fr));gap:10px}
.perfilblk-rowh{transition:background .15s}.perfilblk-rowh:hover{background:var(--surface2)}
`
