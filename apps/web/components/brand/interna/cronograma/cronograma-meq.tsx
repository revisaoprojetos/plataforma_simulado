'use client'

// Cronograma — MEQ (navy/azul/ciano #5ECEF0). Sem hero (mobile: título + subtítulo);
// abas direto. Wizard com STEPPER VERTICAL 230px à esquerda (desktop); lateral "Resumo do
// cronograma" + "Distribuição por matéria". Plano com "Linha do tempo das matérias" (gantt).
// Sora carregada via <link> local (como loading-meq-circuito). Temas claro/azul/escuro.
// Porte fiel de `cronograma.py` (page MEQ/gerar_area/meus_area/plano_area + gantt).

import type { CSSProperties, ReactElement } from 'react'
import { internaTokensStyle, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import {
  cronoVars, cssFor, Card, Head, Cap, CgTabs, Stepper, WizSteps, WizNav, SummaryRows, SubjBars,
  MeusStats, MeusList, Liberados, PlanHead, PlanKpis, PlanProgress, ViewToggle, GridView,
  PlanList, TodayCard, LegendTypes, Gantt, useCronogramaState, type CronogramaState,
} from './shared'

const K = 'meq' as const

function GerarArea({ st, mobile }: { st: CronogramaState; mobile: boolean }) {
  const cardSty: CSSProperties = { borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 1px 2px rgba(16,30,54,.06)' }
  const pad = mobile ? 18 : 26
  let wiz: ReactElement
  if (!mobile) {
    wiz = (
      <div style={{ display: 'flex', overflow: 'hidden', ...cardSty }}>
        <div style={{ width: 230, flexShrink: 0, padding: 22, borderRight: '1px solid var(--line)', background: 'var(--surface2)' }}>
          <Cap>Etapas</Cap>
          <div style={{ marginTop: 10 }}><Stepper k={K} mobile={false} st={st} vertical /></div>
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: pad, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <WizSteps k={K} mobile={false} st={st} /><WizNav k={K} st={st} />
        </div>
      </div>
    )
  } else {
    wiz = (
      <div style={{ padding: pad, display: 'flex', flexDirection: 'column', gap: 20, ...cardSty }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 18, borderBottom: '1px solid var(--line)' }}><Stepper k={K} mobile st={st} /></div>
        <WizSteps k={K} mobile st={st} /><WizNav k={K} st={st} />
      </div>
    )
  }
  const side = (
    <>
      <Card k={K} pad={18}><Head k={K} icon="list" title="Resumo do cronograma" /><SummaryRows st={st} /></Card>
      <Card k={K} pad={18}><Head k={K} icon="chart" title="Distribuição por matéria" /><SubjBars /></Card>
    </>
  )
  if (mobile) return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{wiz}{side}</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 18, alignItems: 'start' }}>
      {wiz}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 90 }}>{side}</div>
    </div>
  )
}

function MeusArea({ st, mobile }: { st: CronogramaState; mobile: boolean }) {
  if (mobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <MeusStats k={K} mobile />
        <MeusList k={K} mobile st={st} />
        <Liberados k={K} st={st} />
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <MeusStats k={K} mobile={false} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 18, alignItems: 'start' }}>
        <MeusList k={K} mobile={false} st={st} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><Liberados k={K} st={st} /></div>
      </div>
    </div>
  )
}

function PlanoArea({ st, mobile }: { st: CronogramaState; mobile: boolean }) {
  const grid = st.pv === 'grade' ? <GridView k={K} mobile={mobile} st={st} /> : null
  const list = st.pv === 'lista'
  const side = (<><TodayCard k={K} /><LegendTypes k={K} /></>)
  if (mobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <PlanHead k={K} mobile st={st} /><PlanKpis k={K} mobile /><TodayCard k={K} /><PlanProgress k={K} st={st} />
        <Gantt k={K} />
        <ViewToggle k={K} mobile st={st} />{grid}
        {list && <div className="vlin"><PlanList k={K} mobile st={st} /></div>}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PlanHead k={K} mobile={false} st={st} /><PlanKpis k={K} mobile={false} /><PlanProgress k={K} st={st} />
      <Gantt k={K} />
      <ViewToggle k={K} mobile={false} st={st} />{grid}
      {list && (
        <div className="vlin" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 18, alignItems: 'start' }}>
          <PlanList k={K} mobile={false} st={st} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 90 }}>{side}</div>
        </div>
      )}
    </div>
  )
}

export function CronogramaMeq({ theme, tab, mobile }: { theme: InternaTheme; tab?: string; mobile: boolean }) {
  const st = useCronogramaState(tab)
  // Tema resolvido no cliente (reage ao toggle do shell ao vivo); `theme` do servidor como fallback.
  const tema = useTemaInterno(theme)
  const dark = tema === 'escuro'
  const rootStyle: CSSProperties = { ...internaTokensStyle('meq', tema), ...cronoVars(K, dark) }
  return (
    <div className="cmq-root" style={rootStyle}>
      {/* Sora não é global; a MEQ usa Sora (como nos mockups e no loading-meq-circuito). */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap" />
      <style dangerouslySetInnerHTML={{ __html: cssFor('cmq-root') }} />
      <div className="pv" style={{ padding: mobile ? '18px 16px 28px' : '24px 32px 48px', maxWidth: mobile ? undefined : 1376, margin: mobile ? undefined : '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {mobile && (
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--head)' }}>Cronograma</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sub)' }}>Gere, acompanhe e ajuste seu plano de estudos.</p>
          </div>
        )}
        <div><CgTabs k={K} mobile={mobile} st={st} /></div>
        <div className="pv" key={st.cg}>
          {st.cg === 'gerar' && <GerarArea st={st} mobile={mobile} />}
          {st.cg === 'meus' && <MeusArea st={st} mobile={mobile} />}
          {st.cg === 'plano' && <PlanoArea st={st} mobile={mobile} />}
        </div>
      </div>
    </div>
  )
}
