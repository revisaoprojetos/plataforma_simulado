'use client'

// RESULTADO INTERNO · VND (spec 05 §2) — gamificado (verde + dourado).
// Hero verde full-bleed + anel de nota; abas Visão geral · Questões · Ranking · Avaliação.
// Ordem da Visão geral (§2.2): 4 anéis → Realizações e cadernos → Comparar → grid 1.6/1
// [Disciplina em tiles coloridos, Tempo, Padrão, CTA verde treino | RECOMPENSAS, mapa, Dificuldade].

import { useState, type ReactNode } from 'react'
import {
  BookOpen,
  Clock,
  LayoutGrid,
  MessageSquare,
  RefreshCw,
  Target,
  Users,
} from 'lucide-react'
import { internaTokensStyle, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import type { ResultadoInternoData } from './data'
import { notec } from './mock'
import {
  AttRows,
  Card,
  CompareCard,
  DificuldadeBlock,
  DonutBlock,
  Head,
  PadraoBlock,
  QFilters,
  QList,
  Qmap,
  RankTab,
  RecompensasCard,
  RevisarCard,
  RingStats,
  TabAval,
  TempoPorQuestao,
  Vring,
  resultadoCss,
  useIsMobile,
} from './shared'

type RT = 'geral' | 'quest' | 'rank' | 'aval'
const P = 'rvn'

export function ResultadoVnd({ theme, data, sessaoId }: { theme: InternaTheme; data: ResultadoInternoData; sessaoId?: string | null }) {
  const tema = useTemaInterno(theme)
  const d = data
  const mobile = useIsMobile()
  const [rt, setRt] = useState<RT>('geral')
  const [qf, setQf] = useState('all')
  const [pg, setPg] = useState(0)
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({})
  const [sel, setSel] = useState<Record<number, boolean>>({})

  const setFilter = (f: string) => { setQf(f); setPg(0) }
  const toggleOpen = (ordem: number) => setOpenMap((map) => ({ ...map, [ordem]: !(map[ordem] ?? ordem === d.correcao[0]?.ordem) }))
  const toggleSel = (n: number) => setSel((m) => ({ ...m, [n]: !(m[n] ?? true) }))
  const allSel = () => setSel(Object.fromEntries(d.tentativas.map((a) => [a.n, true])))
  const noneSel = () => setSel(Object.fromEntries(d.tentativas.map((a) => [a.n, false])))

  const style = { ...internaTokensStyle('vnd', tema), ['--cbOn' as string]: 'var(--brand)' }

  return (
    <div className={P} style={style}>
      <style>{resultadoCss(P)}</style>
      <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
        <Header d={d} mobile={mobile} />
        <div className="rrz-pv" style={{ maxWidth: 1376, margin: '0 auto', padding: mobile ? '18px 18px 28px' : '24px clamp(16px,4vw,32px) 56px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Tabs rt={rt} setRt={setRt} mobile={mobile} />
          <div key={rt} className="rrz-pv">
            {rt === 'geral' && <Geral d={d} mobile={mobile} sel={sel} toggleSel={toggleSel} allSel={allSel} noneSel={noneSel} />}
            {rt === 'quest' && <TabQuest d={d} mobile={mobile} qf={qf} setFilter={setFilter} pg={pg} setPg={setPg} openMap={openMap} toggleOpen={toggleOpen} />}
            {rt === 'rank' && <RankTab brand="vnd" data={d} mobile={mobile} />}
            {rt === 'aval' && <TabAval brand="vnd" mobile={mobile} sessaoId={sessaoId} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoChips({ d }: { d: ResultadoInternoData }) {
  const chips: [ReactNode, string][] = [
    [<LayoutGrid key="g" size={13} />, `${d.melhor.total} questões`],
    [<RefreshCw key="r" size={13} />, `${d.tentativas.length} ${d.tentativas.length === 1 ? 'tentativa' : 'tentativas'}`],
  ]
  if (d.banca) chips.unshift([<BookOpen key="b" size={13} />, d.banca])
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {chips.map(([icon, t], i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 11px', borderRadius: 99, background: 'rgba(255,255,255,.08)', color: '#CFE3D7', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{icon}{t}</span>
      ))}
    </div>
  )
}

function Header({ d, mobile }: { d: ResultadoInternoData; mobile: boolean }) {
  const notaOk = d.notaLiberada && d.melhor.nota !== null
  return (
    <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(120deg,#041A10 0%,#0B4A2E 55%,#12643D 100%)', color: '#FFFFFF', padding: mobile ? '18px 18px 22px' : '22px 0 30px' }}>
      <span aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(circle,rgba(185,245,212,.18) 1.2px,transparent 1.8px)', backgroundSize: '22px 22px' }} />
      <div style={{ position: 'relative', maxWidth: 1376, margin: '0 auto', padding: mobile ? 0 : '0 clamp(16px,4vw,32px)' }}>
        {!mobile ? <a href="#" style={{ fontSize: 12, fontWeight: 700, color: '#86CFA6' }}>‹ Simulados realizados</a> : null}
        <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', alignItems: mobile ? 'stretch' : 'center', gap: mobile ? 16 : 26, flexWrap: 'wrap', marginTop: mobile ? 0 : 10 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: '#86CFA6' }}>RESULTADO DO SIMULADO</span>
            <h1 style={{ margin: '4px 0 10px', fontSize: 'clamp(26px,4vw,36px)', fontWeight: 800, letterSpacing: '-0.045em' }}>{d.titulo}</h1>
            <InfoChips d={d} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {notaOk ? <Vring nota={d.melhor.nota as number} size={88} /> : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', color: '#F1D48A' }}>{notaOk ? 'SUA NOTA' : 'AGUARDANDO LIBERAÇÃO'}</span>
              {d.refazerHref ? (
                <a href={d.refazerHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 16px', borderRadius: 13, background: 'linear-gradient(180deg,#F1D48A,#D8B45A)', color: '#2A1F02', fontSize: 13.5, fontWeight: 800, textDecoration: 'none' }}><RefreshCw size={14} />Refazer</a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Tabs({ rt, setRt, mobile }: { rt: RT; setRt: (t: RT) => void; mobile: boolean }) {
  const labels: [RT, string, string, typeof LayoutGrid][] = [
    ['geral', 'Visão geral', 'Geral', LayoutGrid],
    ['quest', 'Questões', 'Questões', BookOpen],
    ['rank', 'Ranking', 'Ranking', Users],
    ['aval', 'Avaliação', 'Avaliar', MessageSquare],
  ]
  return (
    <div role="tablist" aria-label="Seções do resultado" style={{ display: mobile ? 'grid' : 'flex', gridTemplateColumns: mobile ? 'repeat(4,1fr)' : undefined, gap: 4, padding: 4, borderRadius: 16, background: 'var(--surface2)', border: '1px solid var(--line)', overflowX: 'auto' }}>
      {labels.map(([k, l, lm, Icon]) => {
        const on = rt === k
        return (
          <button key={k} role="tab" aria-selected={on} onClick={() => setRt(k)} style={{ flex: mobile ? undefined : 1, minWidth: mobile ? 0 : 'max-content', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, padding: mobile ? '0 6px' : '0 16px', borderRadius: 12, border: 0, background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--brand)' : 'var(--muted)', boxShadow: on ? '0 3px 0 color-mix(in srgb,var(--brand) 25%,transparent)' : undefined, font: 'inherit', fontSize: mobile ? 12 : 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .25s,color .25s' }}>
            {mobile ? null : <Icon size={16} />}
            {mobile ? lm : l}
          </button>
        )
      })}
    </div>
  )
}

function DiscTiles({ d }: { d: ResultadoInternoData }) {
  if (!d.porDisciplina.length) return <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Sem dados.</span>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
      {d.porDisciplina.map((di) => (
        <div key={di.nome} className="rrz-lift" style={{ minWidth: 0, padding: 14, borderRadius: 18, background: notec(di.pct)[1] }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: notec(di.pct)[0] }}>{di.ac}/{di.tt} CERTAS</span>
          <b style={{ display: 'block', fontSize: 24, letterSpacing: '-0.03em', color: notec(di.pct)[0] }}>{di.pct}%</b>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{di.nome}</span>
          {typeof di.turmaPct === 'number' ? <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Turma {di.turmaPct}%</span> : null}
        </div>
      ))}
    </div>
  )
}

function Geral({ d, mobile, sel, toggleSel, allSel, noneSel }: { d: ResultadoInternoData; mobile: boolean; sel: Record<number, boolean>; toggleSel: (n: number) => void; allSel: () => void; noneSel: () => void }) {
  const disc = <Card brand="vnd"><Head brand="vnd" icon={LayoutGrid} title="Acerto por disciplina" /><DiscTiles d={d} /></Card>
  const tempo = <Card brand="vnd"><Head brand="vnd" icon={Clock} title="Tempo por questão" /><TempoPorQuestao data={d} /></Card>
  const padrao = <Card brand="vnd"><Head brand="vnd" icon={Target} title="Seu padrão de respostas" /><PadraoBlock brand="vnd" data={d} /></Card>
  const treino = <RevisarCard brand="vnd" data={d} />
  const recompensas = <RecompensasCard data={d} />
  const mapa = <Card brand="vnd"><Head brand="vnd" icon={Target} title="Suas respostas" right={<span style={{ fontSize: 12, color: 'var(--muted)' }}>{d.melhor.total} questões</span>} /><Qmap brand="vnd" data={d} cols={10} h={24} /><div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}><DonutBlock data={d} size={96} /></div></Card>
  const dif = <Card brand="vnd"><Head brand="vnd" icon={Target} title="Acerto por dificuldade" /><DificuldadeBlock data={d} /></Card>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: mobile ? 14 : 16 }}>
      <RingStats data={d} />
      <AttRows brand="vnd" data={d} mobile={mobile} sel={sel} onToggleSel={toggleSel} onAll={allSel} onNone={noneSel} />
      <CompareCard brand="vnd" data={d} mobile={mobile} sel={sel} />
      {mobile ? (
        <>{treino}{mapa}{disc}{recompensas}{tempo}{dif}{padrao}</>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{disc}{tempo}{padrao}{treino}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{recompensas}{mapa}{dif}</div>
        </div>
      )}
    </div>
  )
}

function TabQuest({ d, mobile, qf, setFilter, pg, setPg, openMap, toggleOpen }: { d: ResultadoInternoData; mobile: boolean; qf: string; setFilter: (f: string) => void; pg: number; setPg: (p: number) => void; openMap: Record<number, boolean>; toggleOpen: (ordem: number) => void }) {
  const side = (
    <Card brand="vnd" style={mobile ? undefined : { position: 'sticky', top: 90 }}>
      <Head brand="vnd" icon={LayoutGrid} title="Mapa de questões" />
      <Qmap brand="vnd" data={d} cols={10} h={mobile ? 26 : 22} />
      {mobile ? null : <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}><DonutBlock data={d} size={96} /></div>}
    </Card>
  )
  const lst = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <QFilters brand="vnd" data={d} qf={qf} setQf={setFilter} showGerar={!mobile} />
      <QList brand="vnd" data={d} mobile={mobile} qf={qf} pg={pg} setPg={setPg} openMap={openMap} toggleOpen={toggleOpen} />
    </div>
  )
  if (mobile) return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{lst}{side}</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 18, alignItems: 'start' }}>
      {lst}
      {side}
    </div>
  )
}
