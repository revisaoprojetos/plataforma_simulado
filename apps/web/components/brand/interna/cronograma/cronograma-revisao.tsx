'use client'

// Cronograma — Revisão (roxo + amarelo #F1C232). Hero roxo radial, abas dentro do hero,
// wizard em card com lateral roxa "SEU PLANO ATÉ AGORA" + Dica da Revisão.
// Porte fiel de `cronograma.py` (content/rev_hero/gerar_area/meus_area/plano_area).

import type { CSSProperties } from 'react'
import { internaTokensStyle, type InternaTheme } from '../interna-tokens'
import {
  brandKey, cronoVars, cssFor, Ic, CgTabs, Stepper, WizSteps, WizNav, SummaryRows, RevTip,
  MeusStats, MeusList, Liberados, PlanHead, PlanKpis, PlanProgress, ViewToggle, GridView,
  PlanList, TodayCard, LegendTypes, useCronogramaState, type CronogramaState,
} from './shared'

const K = 'rev' as const

function RevHero({ st, mobile }: { st: CronogramaState; mobile: boolean }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: mobile ? 0 : 26, margin: mobile ? '0 -18px' : undefined, padding: mobile ? '24px 18px' : '34px 36px', background: 'radial-gradient(120% 140% at 0% 0%,#3B1E8F 0%,#2E1F7A 45%,#1E1150 100%)', color: '#FFFFFF' }}>
      <span aria-hidden style={{ position: 'absolute', right: mobile ? -20 : 30, top: 10, color: 'rgba(255,255,255,.08)', pointerEvents: 'none' }}><Ic n="cal" s={mobile ? 110 : 160} /></span>
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: '#F1C232' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F1C232' }} />CRONOGRAMA DE ESTUDOS
      </span>
      <h1 style={{ position: 'relative', margin: '10px 0 8px', fontSize: mobile ? 28 : 40, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.08 }}>
        Seu cronograma de estudo <span style={{ color: '#F1C232' }}>do seu jeito.</span>
      </h1>
      <p style={{ position: 'relative', margin: 0, maxWidth: 620, fontSize: 14.5, lineHeight: 1.55, color: '#D9CFFF' }}>
        Escolha a rotina, defina quando começar e receba um plano completo, organizado semana a semana e salvo na sua conta.
      </p>
      <div style={{ position: 'relative', marginTop: 18, maxWidth: 640 }}>
        <CgTabs k={K} mobile={mobile} st={st} onDark />
      </div>
    </div>
  )
}

function GerarArea({ st, mobile }: { st: CronogramaState; mobile: boolean }) {
  const cardSty: CSSProperties = { borderRadius: 22, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 30px 60px -40px rgba(40,20,110,.5)' }
  const wiz = (
    <div style={{ padding: mobile ? 18 : 26, display: 'flex', flexDirection: 'column', gap: 20, ...cardSty }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 18, borderBottom: '1px solid var(--line)' }}><Stepper k={K} mobile={mobile} st={st} /></div>
      <WizSteps k={K} mobile={mobile} st={st} />
      <WizNav k={K} st={st} />
    </div>
  )
  const side = (
    <>
      <div style={{ borderRadius: 22, padding: 20, background: 'radial-gradient(120% 120% at 100% 0%,#6449E0 0%,#3B1E8F 55%,#1E1150 100%)', color: '#FFFFFF' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', color: '#F1C232' }}>SEU PLANO ATÉ AGORA</span>
        <b style={{ display: 'block', margin: '8px 0 6px', fontSize: 32, letterSpacing: '-0.04em' }}>{st.previa.weeks} <span style={{ fontSize: 15, color: '#CFC4FF' }}>semanas</span></b>
        <SummaryRows st={st} darkBg />
      </div>
      <RevTip />
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
        <MeusStats k={K} mobile={mobile} />
        <MeusList k={K} mobile={mobile} st={st} />
        <Liberados k={K} st={st} />
        <RevTip />
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <MeusStats k={K} mobile={mobile} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 18, alignItems: 'start' }}>
        <MeusList k={K} mobile={mobile} st={st} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><Liberados k={K} st={st} /><RevTip /></div>
      </div>
    </div>
  )
}

function PlanoArea({ st, mobile }: { st: CronogramaState; mobile: boolean }) {
  const grid = st.pv === 'grade' ? <GridView k={K} mobile={mobile} st={st} /> : null
  const list = st.pv === 'lista'
  const side = (<>{<TodayCard k={K} />}<LegendTypes k={K} /><RevTip /></>)
  if (mobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <PlanHead k={K} mobile st={st} /><PlanKpis k={K} mobile /><TodayCard k={K} /><PlanProgress k={K} st={st} />
        <ViewToggle k={K} mobile st={st} />{grid}
        {list && <div className="vlin"><PlanList k={K} mobile st={st} /></div>}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PlanHead k={K} mobile={false} st={st} /><PlanKpis k={K} mobile={false} /><PlanProgress k={K} st={st} />
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

export function CronogramaRevisao({ theme, tab, mobile }: { theme: InternaTheme; tab?: string; mobile: boolean }) {
  const st = useCronogramaState(tab)
  const dark = theme === 'escuro'
  const rootStyle: CSSProperties = { ...internaTokensStyle('revisao', theme), ...cronoVars(K, dark) }
  return (
    <div className="crv-root" style={rootStyle}>
      <style dangerouslySetInnerHTML={{ __html: cssFor('crv-root') }} />
      <div className="pv" style={{ padding: mobile ? '16px 18px 28px' : '28px 32px 48px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1376, margin: '0 auto' }}>
        <RevHero st={st} mobile={mobile} />
        <div className="pv" key={st.cg}>
          {st.cg === 'gerar' && <GerarArea st={st} mobile={mobile} />}
          {st.cg === 'meus' && <MeusArea st={st} mobile={mobile} />}
          {st.cg === 'plano' && <PlanoArea st={st} mobile={mobile} />}
        </div>
      </div>
    </div>
  )
}
