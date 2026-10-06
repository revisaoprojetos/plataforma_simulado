'use client'

// Recomendado — MEQ (spec 03 §5). Topo: 4 KPIs (título vem da top bar do shell). Diferencial: "Mapa de
// calor matéria × banca" (5 faixas de cor + "—" sem questões + legenda 0–100%). Depois "Reforço
// recomendado" + card grid 220px|1fr = Lista de reforço (grade 01–10, matéria-alvo, Rumo à meta) + questão
// (qcore, letra QUADRADA). Acentos fixos MEQ: azul #4A8BEA→#2F64C8; ciano #5ECEF0. Fonte Sora (link local).

import { internaTokensStyle, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import { useIsMobile } from '../perfil/use-is-mobile'
import { Ic, SHARED_CSS, OK, WARN, ERR, extraVars } from './shared'
import type { RecoData, RecoDiag, RecoHeat } from './data'
import type { QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { CadernoReforco } from './caderno-reforco'
import * as M from './mock'

// 5 faixas de cor do heatmap (mesma escala do mockup). Retorna [bg, textColor] ou null p/ "—".
function heatCor(pct: number | null): { bg: string; col: string } | null {
  if (pct == null) return null
  if (pct < 30) return { bg: 'rgba(229,72,77,.85)', col: '#FFF' }
  if (pct < 40) return { bg: 'rgba(242,140,60,.8)', col: '#FFF' }
  if (pct < 55) return { bg: 'rgba(242,190,60,.75)', col: '#3A2A00' }
  if (pct < 70) return { bg: 'rgba(62,160,224,.75)', col: '#FFF' }
  return { bg: 'rgba(46,199,122,.85)', col: '#FFF' }
}
const LEGEND = ['rgba(229,72,77,.85)', 'rgba(242,140,60,.8)', 'rgba(242,190,60,.75)', 'rgba(62,160,224,.75)', 'rgba(46,199,122,.85)']

function geralCor(pct: number): string {
  if (pct < 30) return ERR
  if (pct < 60) return WARN
  return OK
}

function cellBase(bg: string, col: string): React.CSSProperties {
  return { height: 34, borderRadius: 6, background: bg, color: col, fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }
}
function HeatCell({ pct }: { pct: number | null }) {
  const c = heatCor(pct)
  if (!c) return <span className="rcm-hc" style={cellBase('var(--surface2)', 'var(--muted2)')}>—</span>
  return <span className="rcm-hc" style={cellBase(c.bg, c.col)}>{pct}%</span>
}

// Deriva o heatmap matéria × banca a partir do diagnóstico quando a página não injeta `data.heatmap`
// (sem banca_id): aí só existe a coluna Geral (todas as células de banca viram "—").
function heatFromDiag(diag: RecoDiag[]): RecoHeat {
  return { bancas: [], totalRespondidas: diag.reduce((a, d) => a + d.tot, 0), linhas: diag.map((d) => ({ id: d.id, materia: d.nome, cols: [], geral: d.pct })) }
}

function Heatmap({ mobile, data }: { mobile: boolean; data: RecoData }) {
  // Mapa de calor matéria × banca (spec §5). Desktop: 5 bancas + coluna Geral; mobile: 3 bancas, sem Geral.
  const heat = data.heatmap ?? heatFromDiag(data.diagnostico)
  const maxBancas = mobile ? 3 : 5
  const bancas = heat.bancas.slice(0, maxBancas)
  const linhas = mobile ? heat.linhas.slice(0, 8) : heat.linhas
  // Colunas: label + uma por banca + (desktop) Geral. Sem bancas → só label + Geral.
  const cols = mobile
    ? `96px repeat(${Math.max(1, bancas.length)},1fr)`
    : `170px repeat(${Math.max(1, bancas.length)},1fr) 64px`

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: mobile ? 16 : 20, boxShadow: 'var(--shadow,none)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
            {[[6, 0.45], [10, 0.7], [14, 1]].map(([h, o], i) => <span key={i} style={{ display: 'block', width: 3, height: h as number, borderRadius: 1, background: 'var(--brand2)', opacity: o as number }} />)}
          </span>
          <div>
            <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Mapa de calor · matéria × banca</h3>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginTop: 2 }}>Seu acerto em cada combinação, das {heat.totalRespondidas} questões respondidas</span>
          </div>
        </div>
        {!mobile && (
          <button type="button" className="rcm-ibtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink)', font: 'inherit', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer' }}><Ic n="sliders" s={14} />Filtrar por cargo</button>
        )}
      </div>
      {/* cabeçalho de colunas */}
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 4, paddingBottom: 6, fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        <span>Matéria</span>
        {bancas.length === 0 && <span style={{ textAlign: 'center' }}>Acerto</span>}
        {bancas.map((b) => <span key={b} style={{ textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b}</span>)}
        {!mobile && <span style={{ textAlign: 'right' }}>Geral</span>}
      </div>
      {linhas.map((r) => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 4, alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.materia}</span>
          {bancas.length === 0 && <HeatCell pct={r.geral} />}
          {bancas.map((_, ci) => <HeatCell key={ci} pct={r.cols[ci] ?? null} />)}
          {!mobile && <b style={{ textAlign: 'right', fontSize: 13, color: geralCor(r.geral) }}>{r.geral}%</b>}
        </div>
      ))}
      {/* legenda */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
        <span>0%</span>
        {LEGEND.map((c, i) => <span key={i} style={{ width: 26, height: 8, borderRadius: 2, background: c }} />)}
        <span>100%</span>
        <span style={{ marginLeft: 'auto' }}>— sem questões</span>
      </div>
    </div>
  )
}

function ListaReforco({ total, alvo }: { total: number; alvo: RecoDiag | null }) {
  const lr = M.LISTA_REFORCO
  const segLit = Math.round((lr.progressoMeta / 100) * 20)
  const materiaAlvo = alvo?.nome ?? lr.materiaAlvo
  const acertoAlvo = alvo?.pct ?? lr.acertoAtual
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Lista de reforço</span>
      {/* grade 01–N */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
        {Array.from({ length: total }).map((_, k) => {
          const on = k === 0
          return <span key={k} style={{ height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, background: on ? 'var(--brand2)' : 'var(--surface2)', color: on ? '#FFF' : 'var(--muted)', border: on ? 'none' : '1px solid var(--line)' }}>{String(k + 1).padStart(2, '0')}</span>
        })}
      </div>
      {/* matéria-alvo */}
      <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {([['Matéria-alvo', materiaAlvo], ['Seu acerto', `${acertoAlvo}%`], ['Meta', `${lr.meta}%`], ['Questões', String(total)]] as [string, string][]).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
            <span style={{ color: 'var(--muted)' }}>{k}</span>
            <b style={{ color: 'var(--ink)' }}>{v}</b>
          </div>
        ))}
      </div>
      {/* Rumo à meta (20 segmentos) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
          <span>Rumo à meta</span><b style={{ color: 'var(--ink)' }}>{lr.progressoMeta}%</b>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {Array.from({ length: 20 }).map((_, k) => (
            <span key={k} style={{ flex: 1, height: 6, borderRadius: 2, background: k < segLit ? 'var(--brand2)' : 'var(--track)' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function QuestaoMeq({ questoes }: { questoes: QuestaoAluno[] }) {
  return (
    <div style={{ minWidth: 0 }}>
      {/* MEQ: "Questão NN / NN" + segmentos ciano; letra QUADRADA (via brand); chips raio 6 (via qcore). */}
      <CadernoReforco brand="meq" questoes={questoes} acento={{ hi: 'var(--cyan)', hiInk: '#FFF' }} chipRadius={6} progresso="segments" />
    </div>
  )
}

function Reforco({ mobile, data, questoes }: { mobile: boolean; data: RecoData; questoes: QuestaoAluno[] }) {
  const total = data.stats.questoesHoje
  const alvo = data.diagnostico[0] ?? null // matéria de maior prioridade
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--brand2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="bolt" s={14} /></span>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--head)' }}>Reforço recomendado</h3>
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--sub)' }}>Atualizado {M.LISTA_REFORCO.atualizadoEm}</span>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: mobile ? 16 : 22, boxShadow: 'var(--shadow,none)' }}>
        {mobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <QuestaoMeq questoes={questoes} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', gap: 24 }}>
            <div style={{ borderRight: '1px solid var(--line)', paddingRight: 22 }}><ListaReforco total={total} alvo={alvo} /></div>
            <QuestaoMeq questoes={questoes} />
          </div>
        )}
      </div>
    </>
  )
}

const CSS = `
.rcmmq-root h1,.rcmmq-root h2,.rcmmq-root h3{font-family:'Sora',sans-serif}
`

export function RecomendadoMeq({ theme: themeProp, data, questoes }: { theme: InternaTheme; data: RecoData; questoes: QuestaoAluno[] }) {
  const theme = useTemaInterno(themeProp)
  const mobile = useIsMobile()
  const pad = mobile ? 14 : 24
  const s = data.stats
  const kpis: [string, string, string][] = [
    ['Matérias', String(s.materias), 'chart'],
    ['Acerto médio', `${s.acertoMedio}%`, 'target'],
    ['Para reforçar', String(s.paraReforcar), 'flag'],
    ['Questões hoje', String(s.questoesHoje), 'clip'],
  ]

  return (
    <div className="rcmmq-root" style={{ ...internaTokensStyle('meq', theme), ...extraVars('meq', theme === 'escuro'), minHeight: '100%', padding: pad, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* MEQ usa Sora (não carregada globalmente) — como em loading-meq-circuito */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap" />
      <style>{SHARED_CSS + CSS}</style>

      {/* 4 KPIs (de data.stats) */}
      <div className="rcm-up" style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10 }}>
        {kpis.map(([l, v, icon]) => (
          <div key={l} style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: 'var(--shadow,none)' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{l}<span style={{ color: 'var(--brand2)', display: 'inline-flex' }}><Ic n={icon} s={15} /></span></span>
            <b style={{ display: 'block', fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ink)', marginTop: 4 }}>{v}</b>
          </div>
        ))}
      </div>

      {/* heatmap (de data.diagnostico) */}
      <div className="rcm-up"><Heatmap mobile={mobile} data={data} /></div>

      {/* reforço recomendado */}
      <div className="rcm-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><Reforco mobile={mobile} data={data} questoes={questoes} /></div>
    </div>
  )
}
