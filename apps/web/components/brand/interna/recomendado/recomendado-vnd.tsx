'use client'

// Recomendado — VND (spec 03 §5). Topo: faixa hero verde (gradiente + dots + chevrons). Diferencial:
// "Mapa das suas matérias" (grid 6 tiles por prioridade ALTA/MÉDIA/OK). Desktop: card "Treino focado"
// grid 1fr|290px = questão (qcore) + coluna "POR QUE ESSA QUESTÃO?" (3 motivos + card Sequência de acertos).
// Acentos fixos VND: verde #14924F→#0C6E3C; dourado #F1D48A→#D8B45A (texto #2A1F02). Prefixo rcmvn-.

import { internaTokensStyle, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import { useIsMobile } from '../perfil/use-is-mobile'
import { Ic, SHARED_CSS, extraVars } from './shared'
import type { RecoData, RecoDiag } from './data'
import type { QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { CadernoReforco } from './caderno-reforco'
import * as M from './mock'

const GOLD = 'linear-gradient(180deg,#F1D48A,#D8B45A)'
const GOLD_INK = '#2A1F02'
const HERO = 'linear-gradient(120deg,#041A10 0%,#0B4A2E 55%,#12643D 100%)'

function Tile({ t }: { t: RecoDiag }) {
  const [cor, bg] = M.PRIO_COR[t.prioridade]
  return (
    <div className="rcm-tile" style={{ position: 'relative', overflow: 'hidden', padding: 14, borderRadius: 18, background: bg, border: '1px solid transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: cor }}>{M.PRIO_LABEL_UP[t.prioridade]}</span>
      </div>
      <b style={{ display: 'block', marginTop: 6, fontSize: 28, letterSpacing: '-0.04em', color: cor }}>{t.pct}%</b>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.nome}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.ac} de {t.tot} questões</span>
      <span aria-hidden style={{ position: 'absolute', left: 0, bottom: 0, height: 4, width: `${Math.max(3, t.pct)}%`, background: cor, borderRadius: '0 4px 0 0', pointerEvents: 'none' }} />
    </div>
  )
}

function Mapa({ mobile, data }: { mobile: boolean; data: RecoData }) {
  // Mapa = as 6 matérias de maior prioridade (piores %), do diagnóstico real.
  const tiles = data.diagnostico.slice(0, 6)
  const respondidas = data.diagnostico.reduce((acc, d) => acc + d.tot, 0)
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 24, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="grid" s={16} /></span>
          <div>
            <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Mapa das suas matérias</h3>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginTop: 2 }}>Baseado em {respondidas} questões respondidas</span>
          </div>
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Toque numa matéria para treinar só ela</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(3,1fr)' : 'repeat(6,1fr)', gap: 10 }}>
        {tiles.map((t) => <Tile key={t.id} t={t} />)}
      </div>
    </div>
  )
}

function PorQue() {
  const motIcon: Record<M.Motivo['tipo'], { icon: string; col: string }> = {
    erro: { icon: 'x', col: '#E5484D' },
    banca: { icon: 'target', col: 'var(--goldToken)' },
    nivel: { icon: 'trend', col: 'var(--brand)' },
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.16em', color: 'var(--goldInk)' }}>POR QUE ESSA QUESTÃO?</span>
      {M.MOTIVOS.map((m) => {
        const mi = motIcon[m.tipo]
        return (
          <div key={m.titulo} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, background: 'var(--surface2)' }}>
            <span style={{ width: 34, height: 34, borderRadius: 11, background: `color-mix(in srgb, ${mi.col} 16%, transparent)`, color: mi.col, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n={mi.icon} s={16} /></span>
            <div style={{ lineHeight: 1.3 }}>
              <b style={{ display: 'block', fontSize: 13, color: 'var(--ink)' }}>{m.titulo}</b>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{m.texto}</span>
            </div>
          </div>
        )
      })}
      {/* card Sequência de acertos (verde) */}
      <div style={{ marginTop: 6, padding: 16, borderRadius: 18, background: 'linear-gradient(150deg,#041A10,#0B4A2E 60%,#12643D)', color: '#FFF' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.16em', color: '#F1D48A' }}>SEQUÊNCIA DE ACERTOS</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '6px 0 10px' }}>
          <b style={{ fontSize: 30, letterSpacing: '-0.04em' }}>{M.SEQ_ACERTOS.atual}</b>
          <span style={{ fontSize: 12.5, color: '#CFE3D7' }}>acerte {M.SEQ_ACERTOS.meta} seguidas e ganhe +{M.SEQ_ACERTOS.xp} XP</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: M.SEQ_ACERTOS.meta }).map((_, k) => (
            <span key={k} style={{ flex: 1, height: 8, borderRadius: 99, background: 'rgba(255,255,255,.16)' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Treino({ mobile, total, questoes }: { mobile: boolean; total: number; questoes: QuestaoAluno[] }) {
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 32, height: 32, borderRadius: 10, background: GOLD, color: GOLD_INK, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="bolt" s={16} /></span>
      <div>
        <b style={{ display: 'block', fontSize: 15.5, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Caderno de reforço</b>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{total} {total === 1 ? 'questão' : 'questões'} · escolhidas pelo seu desempenho</span>
      </div>
    </div>
  )
  const questao = (
    <div style={{ minWidth: 0 }}>
      <CadernoReforco brand="vnd" questoes={questoes} header={header} acento={{ hi: GOLD, hiInk: GOLD_INK, pillShadow: '0 2px 5px -2px rgba(216,180,90,.7)' }} />
    </div>
  )
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 24, padding: 24 }}>
      {mobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {questao}
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 20 }}><PorQue /></div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 290px', gap: 26 }}>
          {questao}
          <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: 24 }}><PorQue /></div>
        </div>
      )}
    </div>
  )
}

const CSS = `
.rcmvn-dots{background-image:radial-gradient(circle,rgba(185,245,212,.18) 1.2px,transparent 1.8px);background-size:22px 22px;animation:rcmvndrift 30s linear infinite}
@keyframes rcmvndrift{to{background-position:220px 110px}}
.rcmvn-chev{animation:rcmvnfloat 6s ease-in-out infinite}
@keyframes rcmvnfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@media (prefers-reduced-motion:reduce){.rcmvn-dots,.rcmvn-chev{animation:none!important}}
`

export function RecomendadoVnd({ theme: themeProp, data, questoes }: { theme: InternaTheme; data: RecoData; questoes: QuestaoAluno[] }) {
  const theme = useTemaInterno(themeProp)
  const mobile = useIsMobile()
  const pad = mobile ? 14 : 24
  const s = data.stats
  const stats: [string, string][] = [
    [String(s.materias), 'matérias analisadas'],
    [`${s.acertoMedio}%`, 'acerto médio'],
    [String(s.paraReforcar), 'para reforçar'],
    [String(s.questoesHoje), 'questões de hoje'],
  ]

  return (
    <div className="rcmvn-root" style={{ ...internaTokensStyle('vnd', theme), ...extraVars('vnd', theme === 'escuro'), minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <style>{SHARED_CSS + CSS}</style>

      {/* faixa hero verde (full-bleed) */}
      <section style={{ position: 'relative', overflow: 'hidden', background: HERO, color: '#FFF', padding: mobile ? '26px 0 24px' : '34px 0 30px' }}>
        <span aria-hidden className="rcmvn-dots" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        {[-90, -50, -10].map((b, i) => (
          <svg key={i} className="rcmvn-chev" viewBox="0 0 200 120" aria-hidden preserveAspectRatio="none" style={{ position: 'absolute', right: '-4%', width: '62%', height: 220, bottom: b, pointerEvents: 'none', animationDelay: `${i * 0.6}s` }}>
            <path d="M0 0 L100 112 L200 0" fill="none" stroke={i === 0 ? 'rgba(232,200,119,.55)' : 'rgba(185,245,212,.12)'} strokeWidth={i === 0 ? 2 : 1.2} vectorEffect="non-scaling-stroke" />
          </svg>
        ))}
        <div style={{ position: 'relative', maxWidth: 1376, margin: '0 auto', padding: `0 ${pad}px`, display: 'flex', alignItems: mobile ? 'flex-start' : 'flex-end', justifyContent: 'space-between', gap: 30, flexDirection: mobile ? 'column' : 'row' }}>
          <div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: '#86CFA6' }}>PARA VOCÊ</span>
            <h1 style={{ margin: '8px 0 4px', fontSize: mobile ? 30 : 40, fontWeight: 800, letterSpacing: '-0.045em' }}>Recomendado para você</h1>
            <p style={{ margin: 0, fontSize: 14, color: '#CFE3D7', maxWidth: 560 }}>Treinos montados pelas suas estatísticas — direto no que mais derruba sua nota.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(4,auto)', gap: 10, width: mobile ? '100%' : undefined }}>
            {stats.map(([v, l]) => (
              <div key={l} style={{ padding: '10px 16px', borderRadius: 16, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(185,245,212,.16)', minWidth: mobile ? 0 : 110 }}>
                <b style={{ display: 'block', fontSize: 20, fontWeight: 800 }}>{v}</b>
                <span style={{ fontSize: 11.5, color: '#B7D3C3' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* conteúdo */}
      <div style={{ maxWidth: 1376, margin: '0 auto', width: '100%', padding: mobile ? '20px 14px 40px' : '26px 32px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div className="rcm-up"><Mapa mobile={mobile} data={data} /></div>
        <div className="rcm-up"><Treino mobile={mobile} total={s.questoesHoje} questoes={questoes} /></div>
      </div>
    </div>
  )
}
