'use client'

// Cronograma — VND (verde + dourado). Hero verde "Monte seu cronograma", abas abaixo,
// wizard em card "tecla" (borda 2px + sombra inferior) + barra de progresso verde sob o
// stepper + lateral RESUMO dourada + Bônus de constância. Trilha de semanas no plano.
// Porte fiel de `cronograma.py` (page VND/gerar_area/meus_area/plano_area + vnd_trail).

import type { CSSProperties } from 'react'
import { internaTokensStyle, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import {
  cronoVars, cssFor, Ic, Card, CgTabs, Stepper, WizSteps, WizNav, SummaryRows,
  MeusStats, MeusList, Liberados, PlanHead, PlanKpis, PlanProgress, ViewToggle, GridView,
  PlanList, TodayCard, LegendTypes, VndTrail, useCronogramaState, type CronogramaState,
} from './shared'

const K = 'vnd' as const

function VndHero({ st, mobile }: { st: CronogramaState; mobile: boolean }) {
  return (
    <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(120deg,#041A10 0%,#0B4A2E 55%,#12643D 100%)', color: '#FFFFFF', padding: mobile ? '22px 18px 24px' : '34px 0 30px' }}>
      <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(185,245,212,.18) 1.2px,transparent 1.8px)', backgroundSize: '22px 22px', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', maxWidth: mobile ? undefined : 1376, margin: mobile ? undefined : '0 auto', padding: mobile ? undefined : '0 32px', display: 'flex', flexDirection: mobile ? 'column' : 'row', gap: mobile ? 16 : 30, alignItems: mobile ? undefined : 'flex-end', justifyContent: mobile ? undefined : 'space-between' }}>
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: '#86CFA6' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#D8B45A', transform: 'rotate(45deg)' }} />CRONOGRAMA DE ESTUDOS
          </span>
          <h1 style={{ margin: '8px 0 4px', fontSize: mobile ? 28 : 40, fontWeight: 800, letterSpacing: '-0.045em' }}>Monte seu cronograma</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#CFE3D7', maxWidth: 560 }}>Rotina, cronograma base e data de início · cada meta concluída vale XP na sua liga.</p>
        </div>
      </div>
    </section>
  )
}

function GerarArea({ st, mobile }: { st: CronogramaState; mobile: boolean }) {
  const cardSty: CSSProperties = { borderRadius: 24, background: 'var(--surface)', border: '2px solid var(--line)', boxShadow: '0 6px 0 var(--line)' }
  const wiz = (
    <div style={{ padding: mobile ? 18 : 26, display: 'flex', flexDirection: 'column', gap: 20, ...cardSty }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 18, borderBottom: '1px solid var(--line)' }}>
        <Stepper k={K} mobile={mobile} st={st} />
        <div style={{ height: 8, borderRadius: 99, background: 'var(--surface2)', boxShadow: 'inset 0 2px 0 rgba(0,0,0,.06)' }}>
          <span style={{ display: 'block', height: '100%', width: `${st.gs * 25}%`, borderRadius: 99, background: 'linear-gradient(90deg,#2BB673,#16804F)', transition: 'width .4s' }} />
        </div>
      </div>
      <WizSteps k={K} mobile={mobile} st={st} />
      <WizNav k={K} st={st} />
    </div>
  )
  const side = (
    <>
      <Card k={K} pad={18}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ width: 46, height: 46, borderRadius: 14, background: 'linear-gradient(160deg,#F1D48A,#B8913A)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 0 #8A6A1E', color: '#2A1F02' }}><Ic n="cal" s={22} /></span>
          <div>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.2em', color: 'var(--goldInk)' }}>RESUMO</span>
            <b style={{ display: 'block', fontSize: 18, color: 'var(--ink)' }}>{st.previa.activities} metas · até {st.previa.xp} XP</b>
          </div>
        </div>
        <SummaryRows st={st} />
      </Card>
      <Card k={K} pad={16}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: '#F0773A' }}><Ic n="flame" s={26} /></span>
          <span style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}><b style={{ color: 'var(--ink)' }}>Bônus de constância:</b> cada semana completa vale um baú com XP extra na sua liga.</span>
        </div>
      </Card>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><Liberados k={K} st={st} /><VndTrail k={K} mobile={false} /></div>
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
        <VndTrail k={K} mobile />
        <ViewToggle k={K} mobile st={st} />{grid}
        {list && <div className="vlin"><PlanList k={K} mobile st={st} /></div>}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PlanHead k={K} mobile={false} st={st} /><PlanKpis k={K} mobile={false} /><PlanProgress k={K} st={st} />
      <VndTrail k={K} mobile={false} />
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

export function CronogramaVnd({ theme: themeProp, tab, mobile }: { theme: InternaTheme; tab?: string; mobile: boolean }) {
  const theme = useTemaInterno(themeProp) // reage ao toggle claro/escuro (o theme do servidor é só o fallback)
  const st = useCronogramaState(tab)
  const dark = theme === 'escuro'
  const rootStyle: CSSProperties = { ...internaTokensStyle('vnd', theme), ...cronoVars(K, dark) }
  return (
    <div className="cvn-root" style={rootStyle}>
      <style dangerouslySetInnerHTML={{ __html: cssFor('cvn-root') }} />
      <VndHero st={st} mobile={mobile} />
      <div className="pv" style={{ padding: mobile ? '18px 18px 28px' : '26px 32px 56px', maxWidth: mobile ? undefined : 1376, margin: mobile ? undefined : '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', justifyContent: mobile ? 'stretch' : 'flex-start' }}><CgTabs k={K} mobile={mobile} st={st} /></div>
        <div className="pv" key={st.cg}>
          {st.cg === 'gerar' && <GerarArea st={st} mobile={mobile} />}
          {st.cg === 'meus' && <MeusArea st={st} mobile={mobile} />}
          {st.cg === 'plano' && <PlanoArea st={st} mobile={mobile} />}
        </div>
      </div>
    </div>
  )
}
