'use client'

// Ligas — VND (spec 04 §4). HERO VERDE full-bleed (gradiente + grade de pontos) com KPIs em VIDRO
// (Divisão · posição · XP · faltam). Card "Divisões" com a DIVTRACK ("70% rumo ao Diamante") + barra dourada.
// Abas (Minha liga | Ranking geral). Minha liga = 3 colunas 300px/1fr/330px: esquerda Top 3 (pódio) +
// Recompensas; centro a CLASSIFICAÇÃO COMPLETA (slot {ranking}); direita o painel VERDE ESCURO "RAIO-X"
// (Sua semana). Pódio = só INICIAIS. Rodapé de privacidade. Prefixo CSS `lgvn-`. DATA-DRIVEN.

import { useState } from 'react'
import type { ReactNode } from 'react'
import { internaTokensStyle, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import { useIsMobile } from '../perfil/use-is-mobile'
import { Ic, Escudo, DivTrack, Podio, SemanaBars, LigaTabs, PrivacyNote, RankingSlot, Painel, StatTile, fmtXp, LIGA_BASE_CSS, type LigaTab, type LigaData } from './shared'
import { PRIVACY } from './mock'

const GOLD = '#E8C877'

const CSS = LIGA_BASE_CSS + `
.lgvn-hero{position:relative;overflow:hidden}
.lgvn-hero .dots{position:absolute;inset:0;background-image:radial-gradient(rgba(185,245,212,.18) 1.2px,transparent 1.2px);background-size:22px 22px;pointer-events:none}
.lgvn-xray{position:relative;overflow:hidden}
.lgvn-xray .dots{position:absolute;inset:0;background-image:radial-gradient(rgba(185,245,212,.14) 1.2px,transparent 1.2px);background-size:20px 20px;pointer-events:none}
/* Adapta ao CONTAINER real (Curseduca/sidebar), não ao viewport: colapsa a grade 3 colunas e
   solta o sticky quando aperta — sem cards cortados em tablet/iframe. */
.lgvn-wrap{container-type:inline-size}
.lgvn-liga{display:grid;grid-template-columns:300px 1fr 330px;gap:18px;align-items:start}
.lgvn-side-sticky{position:sticky;top:90px}
@container (max-width:1080px){.lgvn-liga{grid-template-columns:1fr}.lgvn-side-sticky{position:static}}
`

const RECOMPENSAS: { pos: string; premio: string }[] = [
  { pos: '1º lugar', premio: '+300 XP e moldura exclusiva' },
  { pos: '2º – 3º', premio: '+150 XP' },
  { pos: 'Top 3', premio: 'Promoção para a Liga Diamante' },
]

export function LigasVnd({ theme: themeProp, data, ranking }: { theme: InternaTheme; data: LigaData; ranking?: ReactNode }) {
  const theme = useTemaInterno(themeProp)
  const dark = theme === 'escuro'
  const mobile = useIsMobile()
  const [tab, setTab] = useState<LigaTab>('liga')
  const cor = data.ligaCor ?? GOLD
  const heroGrad = 'linear-gradient(120deg,#041A10,#0B4A2E 55%,#12643D)'

  const Left = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Painel title="Top 3 da semana">
        <Podio podio={data.podio} dark={dark} />
      </Painel>
      <Painel title="Recompensas">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {RECOMPENSAS.map((r) => (
            <div key={r.pos} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, background: 'var(--surface2)' }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: `${GOLD}22`, color: GOLD, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="star" s={15} /></span>
              <div style={{ lineHeight: 1.25, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 12.5, color: 'var(--ink)' }}>{r.pos}</b>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{r.premio}</span>
              </div>
            </div>
          ))}
        </div>
      </Painel>
    </div>
  )

  // Painel verde escuro "RAIO-X DO ALUNO" (Sua semana)
  const Xray = (
    <div className="lgvn-xray lgvn-side-sticky" style={{ borderRadius: 'var(--r)', background: 'linear-gradient(150deg,#06301E,#0B4A2E)', color: '#FFF', padding: 18, display: 'flex', flexDirection: 'column', gap: 14, border: `1px solid ${GOLD}33` }}>
      <span aria-hidden className="dots" />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.16em', color: GOLD }}>RAIO-X DO ALUNO</span>
        <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,.72)' }}>Sua semana de estudo</span>
      </div>
      <div style={{ position: 'relative' }}>
        <SemanaBars semana={data.semana} cor={GOLD} />
      </div>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <StatTile v={`${fmtXp(data.xpSemana)} XP`} l="esta semana" inkV="#FFF" bg="rgba(255,255,255,.08)" />
        <StatTile v={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Ic n="flame" s={15} c={GOLD} />{data.streak}</span>} l="dias de sequência" inkV="#FFF" bg="rgba(255,255,255,.08)" />
      </div>
    </div>
  )

  return (
    <div className="min-h-full" style={{ ...internaTokensStyle('vnd', theme), minHeight: '100%' }}>
      <style>{CSS}</style>
      <div className="lgvn-wrap" style={{ padding: mobile ? '14px' : '24px', display: 'flex', flexDirection: 'column', gap: 22, background: 'var(--bg)', minHeight: '100%' }}>
        {/* HERO VERDE com KPIs em vidro */}
        <div className="lgvn-hero" style={{ borderRadius: 'var(--r)', background: heroGrad, color: '#FFF', padding: mobile ? '18px 16px' : '26px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <span aria-hidden className="dots" />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Escudo cor={cor} size={mobile ? 56 : 64} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.18em', color: GOLD }}>SUA LIGA ATUAL · {data.ligaNome.toUpperCase()}</span>
              <h1 style={{ margin: '4px 0 0', fontSize: mobile ? 28 : 36, fontWeight: 800, letterSpacing: '-0.04em' }}>{data.posicao}º de {data.membros}</h1>
            </div>
          </div>
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10 }}>
            <StatTile v={data.ligaNome.replace('Liga ', '')} l="divisão" bg="rgba(255,255,255,.08)" />
            <StatTile v={`${data.posicao}º`} l={`de ${data.membros} alunos`} bg="rgba(255,255,255,.08)" />
            <StatTile v={`${fmtXp(data.xpTotal)}`} l="XP na temporada" bg="rgba(255,255,255,.08)" />
            <StatTile v={data.proximaNome ? `${fmtXp(data.faltam)}` : '—'} l={data.proximaNome ? `XP até ${data.proximaNome}` : 'divisão máxima'} bg="rgba(255,255,255,.08)" />
          </div>
        </div>

        {/* card Divisões */}
        <Painel title="Divisões" sub={data.proximaNome ? `Rumo à ${data.proximaNome}.` : 'Divisão máxima alcançada.'}>
          <DivTrack tiers={data.tiers} xpTotal={data.xpTotal} proximaNome={data.proximaNome} faltam={data.faltam} dark={dark} />
        </Painel>

        {/* abas */}
        <LigaTabs tab={tab} onTab={setTab} onCell="#12643D" onInk="#FFF" bg="var(--surface2)" />

        {tab === 'liga' ? (
          <div className="lg-pv lgvn-liga" key="liga">
            {Left}
            <Painel title={`${data.ligaNome} · ${data.membros} alunos`} sub="A sua posição está destacada.">
              <RankingSlot ranking={ranking} />
            </Painel>
            {Xray}
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
