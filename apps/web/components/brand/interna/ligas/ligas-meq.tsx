'use client'

// Ligas — MEQ (spec 04 §4). KPIs em 4 cards (Divisão · posição · XP · faltam) → card "Temporada 14 ·
// encerra em 2 dias / {ligaNome}" com botão "Regras da liga" + DIVTRACK + 30 segmentos (XP/próximo).
// Abas (Minha liga | Ranking geral). Minha liga = grade 1fr/340px: CLASSIFICAÇÃO COMPLETA (slot {ranking})
// + lateral "Comparar" (Pódio + Sua semana). Pódio = só INICIAIS. Rodapé de privacidade. Prefixo `lgmq-`.
// Suporta tema azul (theme-azul) via tokens. DATA-DRIVEN.

import { useState } from 'react'
import type { ReactNode } from 'react'
import { internaTokensStyle, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import { useIsMobile } from '../perfil/use-is-mobile'
import { Ic, DivTrack, Podio, SemanaBars, LigaTabs, PrivacyNote, RankingSlot, Painel, fmtXp, LIGA_BASE_CSS, type LigaTab, type LigaData } from './shared'
import { PRIVACY } from './mock'

const CSS = LIGA_BASE_CSS + `
.lgmq-kpi{transition:border-color .2s,transform .2s}.lgmq-kpi:hover{border-color:var(--brand2);transform:translateY(-2px)}
.lgmq-reg{transition:background .15s,border-color .15s}.lgmq-reg:hover{background:var(--chip);border-color:var(--brand2)}
/* Adapta ao CONTAINER real (Curseduca/sidebar), não ao viewport: colapsa a grade Classificação|Pódio
   e solta o sticky quando aperta — sem cards cortados em tablet/iframe. */
.lgmq-wrap{container-type:inline-size}
.lgmq-liga{display:grid;grid-template-columns:1fr 340px;gap:18px;align-items:start}
.lgmq-side{position:sticky;top:90px}
@container (max-width:820px){.lgmq-liga{grid-template-columns:1fr}.lgmq-side{position:static}}
`

function Kpi({ rotulo, valor, icon }: { rotulo: string; valor: string; icon: string }) {
  return (
    <div className="lgmq-kpi" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{rotulo}</span>
        <b style={{ display: 'block', fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ink)', marginTop: 2 }}>{valor}</b>
      </div>
      <Ic n={icon} s={18} c="var(--brand2)" />
    </div>
  )
}

// 30 segmentos: XP atual rumo ao próximo xpMin (dentro da faixa da divisão atual)
function Segs30({ xpTotal, tiers }: { xpTotal: number; tiers: LigaData['tiers'] }) {
  const idx = Math.max(0, tiers.findIndex((t) => t.atual))
  const base = tiers[idx]?.xpMin ?? 0
  const prox = tiers[idx + 1]
  const alvo = prox?.xpMin ?? base + 1
  const pct = prox ? Math.min(1, Math.max(0, (xpTotal - base) / (alvo - base))) : 1
  const lit = Math.round(pct * 30)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: 30 }).map((_, k) => (
          <span key={k} style={{ flex: 1, height: 10, borderRadius: 2, background: k < lit ? 'var(--brand2)' : 'var(--track)' }} />
        ))}
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{fmtXp(xpTotal)} / {fmtXp(alvo)} XP</span>
    </div>
  )
}

export function LigasMeq({ theme: themeProp, data, ranking }: { theme: InternaTheme; data: LigaData; ranking?: ReactNode }) {
  const theme = useTemaInterno(themeProp)
  const dark = theme === 'escuro'
  const mobile = useIsMobile()
  const [tab, setTab] = useState<LigaTab>('liga')

  const Side = (
    <div className="lgmq-side" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Painel title="Comparar aluno" sub="Top 3 da liga (anônimo).">
        <Podio podio={data.podio} dark={dark} />
      </Painel>
      <Painel title="Sua semana" sub={`${fmtXp(data.xpSemana)} XP nos últimos 7 dias.`}>
        <SemanaBars semana={data.semana} cor="var(--brand2)" />
      </Painel>
    </div>
  )

  return (
    <div className="min-h-full" style={{ ...internaTokensStyle('meq', theme), minHeight: '100%' }}>
      <style>{CSS}</style>
      <div className="lgmq-wrap" style={{ padding: mobile ? '14px' : '24px', display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--bg)', minHeight: '100%' }}>
        {mobile ? <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ink)' }}>Ligas</h1> : null}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10 }}>
          <Kpi rotulo="Divisão" valor={data.ligaNome.replace('Liga ', '')} icon="trophy" />
          <Kpi rotulo="Posição" valor={`${data.posicao}º/${data.membros}`} icon="users" />
          <Kpi rotulo="XP" valor={fmtXp(data.xpTotal)} icon="bolt" />
          <Kpi rotulo="Até a próxima" valor={data.proximaNome ? fmtXp(data.faltam) : '—'} icon="up" />
        </div>

        {/* card Temporada + divtrack + 30 segmentos */}
        <Painel>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--brand2)' }}>Temporada 14 · encerra em 2 dias</span>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{data.ligaNome}</h3>
            </div>
            <button type="button" className="lgmq-reg" style={{ height: 36, padding: '0 14px', borderRadius: 9, border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Ic n="trophy" s={14} />Regras da liga
            </button>
          </div>
          <DivTrack tiers={data.tiers} xpTotal={data.xpTotal} proximaNome={data.proximaNome} faltam={data.faltam} dark={dark} />
          <Segs30 xpTotal={data.xpTotal} tiers={data.tiers} />
        </Painel>

        {/* abas */}
        <LigaTabs tab={tab} onTab={setTab} onCell="var(--brand2)" onInk="#0B1020" bg="var(--surface2)" radius={8} />

        {tab === 'liga' ? (
          <div className="lg-pv lgmq-liga" key="liga">
            <Painel title={`${data.ligaNome}`} sub="A sua posição está destacada.">
              <RankingSlot ranking={ranking} />
            </Painel>
            {Side}
          </div>
        ) : (
          <div className="lg-pv" key="geral">
            <Painel title="Ranking geral" sub={`${fmtXp(12840)} alunos ativos — você está no top 4%.`}>
              <RankingSlot ranking={ranking} />
            </Painel>
          </div>
        )}

        <PrivacyNote text={PRIVACY} />
      </div>
    </div>
  )
}
