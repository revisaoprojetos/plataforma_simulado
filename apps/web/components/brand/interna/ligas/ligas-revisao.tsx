'use client'

// Ligas — REVISÃO (spec 04 §4). HERO ROXO full-bleed no topo: escudo/troféu dourado + "SUA LIGA ATUAL ·
// {ligaNome}", posição ("Nº de N · XP"), 3 tiles (XP esta semana / faltam p/ próxima / dias de sequência)
// e a DIVTRACK sobre o fundo escuro. SEM KPIs. Abas (Minha liga | Ranking geral). Minha liga = grade
// 1fr/340px: à esquerda a CLASSIFICAÇÃO COMPLETA (slot {ranking}); à direita (sticky) Pódio da semana +
// Sua semana. Rodapé de privacidade. Prefixo CSS `lgrv-`. Pódio = só INICIAIS. DATA-DRIVEN.

import { useState, type CSSProperties } from 'react'
import type { ReactNode } from 'react'
import { internaTokensStyle, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import { useIsMobile } from '../perfil/use-is-mobile'
import { Ic, Escudo, DivTrack, Podio, SemanaBars, LigaTabs, PrivacyNote, RankingSlot, Painel, StatTile, fmtXp, LIGA_BASE_CSS, type LigaTab, type LigaData } from './shared'
import { PRIVACY } from './mock'

const CSS = LIGA_BASE_CSS + `
.lgrv-hero{position:relative;overflow:hidden}
.lgrv-hero .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:24px 24px;-webkit-mask-image:linear-gradient(180deg,#000,transparent 85%);mask-image:linear-gradient(180deg,#000,transparent 85%);pointer-events:none}
/* Adaptação ao CONTAINER (não ao viewport): dentro da Curseduca/sidebar a largura real é menor
   que a janela, então media-query falha. Container query colapsa a grade Classificação|Pódio
   e solta o sticky quando o espaço aperta — nada de card cortado em tablet/iframe. */
.lgrv-wrap{container-type:inline-size}
.lgrv-liga{display:grid;grid-template-columns:1fr 340px;gap:18px;align-items:start}
.lgrv-side{position:sticky;top:90px}
@container (max-width:820px){.lgrv-liga{grid-template-columns:1fr}.lgrv-side{position:static}}
`

export function LigasRevisao({ theme: themeProp, data, ranking }: { theme: InternaTheme; data: LigaData; ranking?: ReactNode }) {
  const theme = useTemaInterno(themeProp)
  const dark = theme === 'escuro'
  const mobile = useIsMobile()
  const [tab, setTab] = useState<LigaTab>('liga')
  const cor = data.ligaCor ?? '#E8A93A'
  const heroGrad = 'linear-gradient(140deg,#24166A,#4B30BE 55%,#6449E0)'

  const Side = (
    <div className="lgrv-side" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Painel title="Pódio da semana" sub="Os três primeiros da sua liga.">
        <Podio podio={data.podio} dark={dark} />
      </Painel>
      <Painel title="Sua semana" sub={`${fmtXp(data.xpSemana)} XP acumulados nos últimos 7 dias.`}>
        <SemanaBars semana={data.semana} cor="var(--brand)" />
      </Painel>
    </div>
  )

  return (
    <div className="min-h-full" style={{ ...internaTokensStyle('revisao', theme), minHeight: '100%' }}>
      <style>{CSS}</style>
      <div className="lgrv-wrap" style={{ padding: mobile ? '14px' : '24px', display: 'flex', flexDirection: 'column', gap: 22, background: 'var(--bg)', minHeight: '100%' }}>
        {/* HERO ROXO full-bleed */}
        <div className="lgrv-hero" style={{ borderRadius: 'var(--r)', background: heroGrad, color: '#FFF', padding: mobile ? '18px 16px' : '26px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <span aria-hidden className="grid" />
          <div style={{ position: 'relative', display: 'flex', alignItems: mobile ? 'flex-start' : 'center', gap: 16, flexWrap: 'wrap' }}>
            <Escudo cor={cor} size={mobile ? 56 : 68} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.18em', color: '#F1C232' }}>SUA LIGA ATUAL · {data.ligaNome.toUpperCase()}</span>
              <h1 style={{ margin: '4px 0 0', fontSize: mobile ? 24 : 30, fontWeight: 800, letterSpacing: '-0.04em' }}>{data.posicao}º de {data.membros} alunos</h1>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: 'rgba(255,255,255,.78)' }}>{fmtXp(data.xpTotal)} XP acumulados nesta temporada.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3,minmax(110px,1fr))', gap: 10, width: mobile ? '100%' : undefined }}>
              <StatTile v={`${fmtXp(data.xpSemana)} XP`} l="esta semana" />
              <StatTile v={data.proximaNome ? `${fmtXp(data.faltam)} XP` : '—'} l={data.proximaNome ? `até ${data.proximaNome}` : 'divisão máxima'} />
              <StatTile v={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Ic n="flame" s={16} c="#F1C232" />{data.streak}</span>} l="dias de sequência" />
            </div>
          </div>
          {/* divtrack sobre fundo escuro */}
          <div style={{ position: 'relative', padding: mobile ? '14px' : '16px 18px', borderRadius: 16, background: 'rgba(13,8,40,.4)', border: '1px solid rgba(255,255,255,.1)' }}>
            <DivTrack tiers={data.tiers} xpTotal={data.xpTotal} proximaNome={data.proximaNome} faltam={data.faltam} dark={dark} onDark />
          </div>
        </div>

        {/* abas */}
        <LigaTabs tab={tab} onTab={setTab} onCell="#2E1F7A" onInk="#FFF" bg={dark ? '#2C2C34' : '#ECE8F6'} />

        {tab === 'liga' ? (
          <div className="lg-pv lgrv-liga" key="liga">
            <Painel title={`Classificação da ${data.ligaNome}`} sub="A sua posição está destacada.">
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
