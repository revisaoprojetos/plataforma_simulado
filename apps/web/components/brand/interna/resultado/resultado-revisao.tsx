'use client'

// RESULTADO INTERNO · REVISÃO (spec 05 §2) — relatório limpo (roxo + amarelo).
// Header card roxo + nota amarela 56px; abas Visão geral · Questões · Ranking · Avaliação.
// Ordem da Visão geral (§2.2): KPIs → Realizações e cadernos → Comparar → grid [Disciplina,
// Tempo, Padrão | Mapa+donut, O que revisar, Dificuldade]. Downloads dentro de Realizações.

import { useState, type ReactNode } from 'react'
import {
  BookOpen,
  Clock,
  Grid2x2,
  LayoutGrid,
  MessageSquare,
  RefreshCw,
  Target,
  Users,
} from 'lucide-react'
import { internaTokensStyle, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import type { ResultadoInternoData } from './data'
import { fnum, posFmt } from './mock'
import {
  AttRows,
  Card,
  CompareCard,
  DificuldadeBlock,
  DiscBars,
  DonutBlock,
  Head,
  PadraoBlock,
  QFilters,
  QList,
  Qmap,
  RankTab,
  RevisarCard,
  StatTiles,
  TabAval,
  TempoPorQuestao,
  resultadoCss,
  useIsMobile,
} from './shared'

type RT = 'geral' | 'quest' | 'rank' | 'aval'
const P = 'rrv'

export function ResultadoRevisao({ theme, data, sessaoId }: { theme: InternaTheme; data: ResultadoInternoData; sessaoId?: string | null }) {
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

  const style = { ...internaTokensStyle('revisao', tema), ['--cbOn' as string]: 'var(--brand)' }

  return (
    <div className={P} style={style}>
      <style>{resultadoCss(P)}</style>
      <div className="rrz-pv" style={{ padding: mobile ? '18px 18px 28px' : '24px clamp(16px,4vw,32px) 48px', minHeight: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {!mobile ? <a href="#" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>‹ Simulados realizados</a> : null}
        <Header d={d} mobile={mobile} />
        <Tabs rt={rt} setRt={setRt} mobile={mobile} />
        <div key={rt} className="rrz-pv">
          {rt === 'geral' && <Geral d={d} mobile={mobile} sel={sel} toggleSel={toggleSel} allSel={allSel} noneSel={noneSel} />}
          {rt === 'quest' && <TabQuest d={d} mobile={mobile} qf={qf} setFilter={setFilter} pg={pg} setPg={setPg} openMap={openMap} toggleOpen={toggleOpen} />}
          {rt === 'rank' && <RankTab brand="revisao" data={d} mobile={mobile} />}
          {rt === 'aval' && <TabAval brand="revisao" mobile={mobile} sessaoId={sessaoId} />}
        </div>
      </div>
    </div>
  )
}

function InfoChips({ d }: { d: ResultadoInternoData }) {
  const chips: [ReactNode, string][] = [
    [<Grid2x2 key="g" size={13} />, `${d.melhor.total} questões`],
    [<RefreshCw key="r" size={13} />, `${d.tentativas.length} ${d.tentativas.length === 1 ? 'realização' : 'realizações'}`],
  ]
  if (d.banca) chips.unshift([<BookOpen key="b" size={13} />, d.banca])
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {chips.map(([icon, t], i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 11px', borderRadius: 99, background: 'rgba(255,255,255,.12)', color: '#E1D9FF', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{icon}{t}</span>
      ))}
    </div>
  )
}

function Header({ d, mobile }: { d: ResultadoInternoData; mobile: boolean }) {
  const notaTxt = d.notaLiberada && d.melhor.nota !== null ? fnum(d.melhor.nota) : null
  const pos = d.melhor.posicao !== null ? posFmt(d.melhor.posicao) : null
  const part = d.melhor.participantes
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, padding: mobile ? 20 : 'clamp(20px,3vw,26px) clamp(20px,4vw,30px)', background: 'linear-gradient(130deg,#24166A,#4B30BE 55%,#6449E0)', color: '#FFFFFF' }}>
      <span aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: mobile ? 'column' : 'row', alignItems: mobile ? 'stretch' : 'flex-end', justifyContent: 'space-between', gap: mobile ? 18 : 24, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: '#F1C232' }}>RESULTADO</span>
          <h1 style={{ margin: '6px 0 12px', fontSize: mobile ? 22 : 'clamp(22px,3vw,30px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.15 }}>{d.titulo}</h1>
          <InfoChips d={d} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: mobile ? 'flex-start' : 'flex-end', gap: 10 }}>
          <div style={{ textAlign: mobile ? 'left' : 'right' }}>
            {notaTxt ? (
              <>
                <b style={{ display: 'block', fontSize: mobile ? 44 : 'clamp(44px,6vw,56px)', fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1, color: '#F1C232' }}>{notaTxt}</b>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.18em', color: '#CFC4FF' }}>MELHOR NOTA{pos ? ` · ${pos}${part ? ` DE ${part.toLocaleString('pt-BR')}` : ''}` : ''}</span>
              </>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', height: 44, padding: '0 14px', borderRadius: 12, background: 'rgba(255,255,255,.12)', fontSize: 14, fontWeight: 700, color: '#E1D9FF' }}>Aguardando liberação</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {d.cadernoHref ? (
              <a href={d.cadernoHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 42, padding: '0 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.3)', color: '#FFFFFF', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}><BookOpen size={14} />Caderno</a>
            ) : null}
            {d.refazerHref ? (
              <a href={d.refazerHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 16px', borderRadius: 12, background: '#F1C232', color: '#2A1A55', fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', textDecoration: 'none' }}><RefreshCw size={14} />Refazer simulado</a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
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
    <div role="tablist" aria-label="Seções do resultado" style={{ display: mobile ? 'grid' : 'flex', gridTemplateColumns: mobile ? 'repeat(4,1fr)' : undefined, gap: 4, padding: 4, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--line)', overflowX: 'auto' }}>
      {labels.map(([k, l, lm, Icon]) => {
        const on = rt === k
        return (
          <button key={k} role="tab" aria-selected={on} onClick={() => setRt(k)} style={{ flex: mobile ? undefined : 1, minWidth: mobile ? 0 : 'max-content', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, padding: mobile ? '0 6px' : '0 16px', borderRadius: 10, border: 0, background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--brand)' : 'var(--muted)', boxShadow: on ? '0 1px 2px rgba(0,0,0,.08)' : undefined, font: 'inherit', fontSize: mobile ? 12 : 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .25s,color .25s' }}>
            {mobile ? null : <Icon size={16} />}
            {mobile ? lm : l}
          </button>
        )
      })}
    </div>
  )
}

function Geral({ d, mobile, sel, toggleSel, allSel, noneSel }: { d: ResultadoInternoData; mobile: boolean; sel: Record<number, boolean>; toggleSel: (n: number) => void; allSel: () => void; noneSel: () => void }) {
  const disc = <Card brand="revisao"><Head brand="revisao" icon={BookOpen} title="Acerto por disciplina" sub="Você x média da turma" /><DiscBars data={d} /></Card>
  const tempo = <Card brand="revisao"><Head brand="revisao" icon={Clock} title="Tempo por questão" sub="Barras pelo resultado · traço = média" /><TempoPorQuestao data={d} /></Card>
  const padrao = <Card brand="revisao"><Head brand="revisao" icon={Target} title="Seu padrão de respostas" /><PadraoBlock brand="revisao" data={d} /></Card>
  const mapa = (
    <Card brand="revisao">
      <Head brand="revisao" icon={LayoutGrid} title="Mapa de questões" right={<span style={{ fontSize: 12, color: 'var(--muted)' }}>{d.melhor.total} questões</span>} />
      <Qmap brand="revisao" data={d} cols={10} h={24} />
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}><DonutBlock data={d} /></div>
    </Card>
  )
  const revisar = <RevisarCard brand="revisao" data={d} />
  const dif = <Card brand="revisao"><Head brand="revisao" icon={Target} title="Acerto por dificuldade" /><DificuldadeBlock data={d} /></Card>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: mobile ? 14 : 16 }}>
      <StatTiles brand="revisao" data={d} />
      <AttRows brand="revisao" data={d} mobile={mobile} sel={sel} onToggleSel={toggleSel} onAll={allSel} onNone={noneSel} />
      <CompareCard brand="revisao" data={d} mobile={mobile} sel={sel} />
      {mobile ? (
        <>{mapa}{disc}{dif}{padrao}{tempo}{revisar}</>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{disc}{tempo}{padrao}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{mapa}{revisar}{dif}</div>
        </div>
      )}
    </div>
  )
}

function TabQuest({ d, mobile, qf, setFilter, pg, setPg, openMap, toggleOpen }: { d: ResultadoInternoData; mobile: boolean; qf: string; setFilter: (f: string) => void; pg: number; setPg: (p: number) => void; openMap: Record<number, boolean>; toggleOpen: (ordem: number) => void }) {
  const side = (
    <Card brand="revisao" style={mobile ? undefined : { position: 'sticky', top: 90 }}>
      <Head brand="revisao" icon={LayoutGrid} title="Mapa de questões" />
      <Qmap brand="revisao" data={d} cols={10} h={mobile ? 26 : 22} />
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}><DonutBlock data={d} size={96} /></div>
      {d.assuntosMaisErrados?.length ? (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <b style={{ display: 'block', fontSize: 12.5, color: 'var(--ink)', marginBottom: 8 }}>Assuntos que você mais errou</b>
          {d.assuntosMaisErrados.slice(0, 4).map((a, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', fontSize: 12, color: 'var(--muted)' }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.assunto}</span>
              <b style={{ color: '#E5484D' }}>{a.erros}</b>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  )
  const lst = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <QFilters brand="revisao" data={d} qf={qf} setQf={setFilter} showGerar={!mobile} />
      <QList brand="revisao" data={d} mobile={mobile} qf={qf} pg={pg} setPg={setPg} openMap={openMap} toggleOpen={toggleOpen} />
    </div>
  )
  if (mobile) return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{lst}{side}</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 18, alignItems: 'start' }}>
      {lst}
      {side}
    </div>
  )
}
