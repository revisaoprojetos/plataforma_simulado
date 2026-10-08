'use client'

// Recomendado — Revisão (spec 03 §5). Topo: kicker "PARA VOCÊ" + H1 + 4 stats. Diferencial: Insight
// faixa amarela (--peachBg). Desktop: grid 380px|1fr = Diagnóstico por matéria (12 linhas) + Caderno de
// reforço (chips + bloco de questão qcore). Acentos fixos Revisão: amarelo #F1C232 / texto #2A1A55; CTA
// gradiente roxo. Dark-reativo via useTemaInterno. Prefixo CSS rcmrv-. Full-bleed (min-height:100%).

import { internaTokensStyle, type Brand, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import { useIsMobile } from '../perfil/use-is-mobile'
import { Ic, SHARED_CSS, OK, extraVars } from './shared'
import type { RecoData, RecoDiag } from './data'
import type { QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { CadernoReforco } from './caderno-reforco'
import * as M from './mock'

const AMBAR = '#F1C232'
const AMBAR_INK = '#2A1A55'
const CTA = 'linear-gradient(180deg,#6449E0,#4B30BE)'

function statIcon(i: number) {
  return ['chart', 'target', 'flag', 'clip'][i]
}

function DiagLinha({ d }: { d: RecoDiag }) {
  const [cor, bg] = M.PRIO_COR[d.prioridade]
  return (
    <div className="rcm-rowh" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 46px 58px', alignItems: 'center', gap: 10, padding: '9px 10px', margin: '0 -10px' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.nome}</span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{d.ac}/{d.tot}</span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
          <span className="rcm-bar" style={{ display: 'block', width: `${Math.max(2, d.pct)}%`, height: '100%', borderRadius: 99, background: cor }} />
        </div>
      </div>
      <b style={{ textAlign: 'right', fontSize: 13.5, color: cor }}>{d.pct}%</b>
      <span style={{ justifySelf: 'end', height: 22, padding: '0 8px', borderRadius: 99, background: bg, color: cor, fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>{M.PRIO_LABEL[d.prioridade]}</span>
    </div>
  )
}

function Diagnostico({ data }: { data: RecoData }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Ic n="chart" s={18} c="var(--brand)" />
        <div>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Diagnóstico por matéria</h3>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginTop: 2 }}>{data.stats.materias} matérias · média {data.stats.acertoMedio}%</span>
        </div>
      </div>
      {data.diagnostico.map((d) => <DiagLinha key={d.id} d={d} />)}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: 11.5, color: 'var(--muted)' }}>
        {([['#E5484D', '< 30% prioridade alta'], ['#D99A1E', '30–59% média'], [OK, '60%+ ok']] as [string, string][]).map(([c, t]) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{t}</span>
        ))}
      </div>
    </div>
  )
}

function Caderno({ brand, total, questoes }: { brand: Brand; total: number; questoes: QuestaoAluno[] }) {
  const header = (
    <>
      <b style={{ display: 'block', fontSize: 17, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Caderno de reforço</b>
      <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{total} {total === 1 ? 'questão' : 'questões'} · selecionadas pelos seus erros recentes</span>
    </>
  )
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 24 }}>
      <CadernoReforco brand={brand} questoes={questoes} header={header} acento={{ hi: AMBAR, hiInk: AMBAR_INK }} />
    </div>
  )
}

const CSS = `
.rcmrv-cta{background:${CTA};box-shadow:0 10px 20px -12px rgba(75,48,190,.8),inset 0 1px 0 rgba(255,255,255,.2)}
`

export function RecomendadoRevisao({ theme: themeProp, data, questoes }: { theme: InternaTheme; data: RecoData; questoes: QuestaoAluno[] }) {
  const theme = useTemaInterno(themeProp)
  const mobile = useIsMobile()
  // Empilha o grid "Diagnóstico | Reforço" já em TABLET (≤980px): no 2-col o painel de reforço (1fr) ficava
  // estreito demais (~285px) e o conteúdo saía cortado. Em iframe estreito também empilha.
  const compact = useIsMobile(980)
  const pad = mobile ? 14 : 24
  const s = data.stats
  const ins = data.insight
  const stats: [string, string][] = [
    [String(s.materias), 'matérias analisadas'],
    [`${s.acertoMedio}%`, 'acerto médio'],
    [String(s.paraReforcar), 'para reforçar'],
    [String(s.questoesHoje), 'questões de hoje'],
  ]

  return (
    <div className="rcmrv-root" style={{ ...internaTokensStyle('revisao', theme), ...extraVars('revisao', theme === 'escuro'), minHeight: '100%', padding: pad, display: 'flex', flexDirection: 'column', gap: 22 }}>
      <style>{SHARED_CSS + CSS}</style>

      {/* topo: kicker + H1 + subtítulo */}
      <div className="rcm-up">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: 'var(--accentInk)' }}>PARA VOCÊ</span>
        <h1 style={{ margin: '6px 0 0', fontSize: mobile ? 26 : 32, fontWeight: 800, letterSpacing: '-0.045em', color: 'var(--ink)' }}>Recomendado para você</h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--muted)' }}>Questões escolhidas a partir das suas estatísticas — reforce onde você mais erra.</p>
      </div>

      {/* 4 stats (de data.stats) */}
      <div className="rcm-up" style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10 }}>
        {stats.map(([v, l], i) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <span style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n={statIcon(i)} s={17} /></span>
            <div style={{ lineHeight: 1.2, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{v}</b>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Insight (faixa amarela) — de data.insight */}
      {ins && (
        <div className="rcm-up" style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: mobile ? 'flex-start' : 'center', gap: 18, padding: '18px 22px', borderRadius: 18, background: 'var(--peachBg)', border: '1px solid rgba(241,194,50,.45)', flexDirection: mobile ? 'column' : 'row' }}>
          <span style={{ width: 46, height: 46, borderRadius: 14, background: AMBAR, color: AMBAR_INK, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="bulb" s={22} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 15, color: 'var(--ink)' }}>Sua maior oportunidade agora é {ins.materia}</b>
            <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>{ins.tot} questões feitas e {ins.pct}% de acerto ({ins.ac} certas). Com {s.questoesHoje} questões de reforço por dia, você sobe mais rápido a sua média geral.</span>
          </div>
          <button type="button" className="rcm-cta" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, padding: '0 16px', border: 0, borderRadius: 12, background: AMBAR, color: AMBAR_INK, font: 'inherit', fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', cursor: 'pointer' }}><Ic n="play" s={14} />Reforçar {ins.materia}</button>
        </div>
      )}

      {/* grid 380px | 1fr (mobile: reforço primeiro, depois diagnóstico) */}
      <div className="rcm-up" style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '380px minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        {compact ? (
          <>
            <Caderno brand="revisao" total={s.questoesHoje} questoes={questoes} />
            <Diagnostico data={data} />
          </>
        ) : (
          <>
            <Diagnostico data={data} />
            <Caderno brand="revisao" total={s.questoesHoje} questoes={questoes} />
          </>
        )}
      </div>
    </div>
  )
}
