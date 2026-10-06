'use client'

// RESULTADO INTERNO · MEQ (spec 05 §2) — boletim/dashboard denso (navy/azul).
// Card branco + faixa de 5 números (Nota · Corte · Diferença · Posição · Percentil); tabelas;
// navegador à esquerda. Visão geral (§2.2): Realizações → Comparar → grid 1.5/1
// [Disciplina tabela, Tempo, Prioridades (Gerar caderno), Padrão | Gabarito (mapa+donut), Dificuldade].

import { useState, type ReactNode } from 'react'
import {
  BookOpen,
  Clock,
  Download,
  LayoutGrid,
  List,
  MessageSquare,
  RefreshCw,
  Target,
  Users,
} from 'lucide-react'
import { internaTokensStyle, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import type { ResultadoInternoData } from './data'
import { fnum, notec, posFmt } from './mock'
import {
  AttRows,
  Capt,
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
  RevisarCard,
  TabAval,
  TempoPorQuestao,
  resultadoCss,
  useIsMobile,
} from './shared'

type RT = 'geral' | 'quest' | 'rank' | 'aval'
const P = 'rmq'

/** Barra segmentada MEQ: `total` divisões, `on` preenchidas. */
function Segs({ total, on, h = 6, gap = 2, color = 'var(--brand2)' }: { total: number; on: number; h?: number; gap?: number; color?: string }) {
  return (
    <div style={{ display: 'flex', gap, width: '100%' }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{ flex: 1, minWidth: 0, height: h, borderRadius: 2, background: i < on ? color : 'var(--track)' }} />
      ))}
    </div>
  )
}

export function ResultadoMeq({ theme, data, sessaoId }: { theme: InternaTheme; data: ResultadoInternoData; sessaoId?: string | null }) {
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

  const style = { ...internaTokensStyle('meq', tema), ['--cbOn' as string]: 'var(--brand2)' }

  return (
    <div className={P} style={style}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap" />
      <style>{resultadoCss(P)}</style>
      <div className="rrz-pv" style={{ padding: mobile ? '18px 16px 28px' : '24px clamp(16px,4vw,32px) 48px', minHeight: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Header d={d} mobile={mobile} />
        <Tabs rt={rt} setRt={setRt} mobile={mobile} />
        <div key={rt} className="rrz-pv">
          {rt === 'geral' && <Geral d={d} mobile={mobile} sel={sel} toggleSel={toggleSel} allSel={allSel} noneSel={noneSel} />}
          {rt === 'quest' && <TabQuest d={d} mobile={mobile} qf={qf} setFilter={setFilter} pg={pg} setPg={setPg} openMap={openMap} toggleOpen={toggleOpen} />}
          {rt === 'rank' && <RankTab brand="meq" data={d} mobile={mobile} />}
          {rt === 'aval' && <TabAval brand="meq" mobile={mobile} sessaoId={sessaoId} />}
        </div>
      </div>
    </div>
  )
}

function Header({ d, mobile }: { d: ResultadoInternoData; mobile: boolean }) {
  const m = d.melhor
  const notaTxt = d.notaLiberada && m.nota !== null ? fnum(m.nota) : '—'
  const corte = d.corteEstimado
  const diff = corte != null && m.nota != null ? Math.round((m.nota - corte) * 10) / 10 : null
  const strip: [string, string, string][] = [
    ['Nota', notaTxt, d.notaLiberada && m.nota !== null ? notec(m.nota)[0] : 'var(--muted)'],
    ['Nota de corte', corte != null ? fnum(corte) : '—', 'var(--ink)'],
    ['Diferença', diff != null ? `${diff >= 0 ? '+' : ''}${fnum(diff)}` : '—', diff == null ? 'var(--ink)' : diff >= 0 ? '#1FA868' : '#E5484D'],
    ['Posição', m.posicao !== null ? posFmt(m.posicao) : '—', 'var(--ink)'],
    ['Percentil', m.percentil != null ? `${m.percentil}%` : '—', 'var(--ink)'],
  ]
  return (
    <Card brand="meq" pad="16px 20px">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <Capt>{d.short ? `${d.short} · ` : ''}Resultado · {d.banca ? `${d.banca} · ` : ''}{m.total} questões · {d.tentativas.length} {d.tentativas.length === 1 ? 'tentativa' : 'tentativas'}</Capt>
        <div style={{ display: 'flex', gap: 8 }}>
          {!mobile && d.cadernoHref ? (
            <a href={d.cadernoHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}><Download size={14} />Baixar caderno</a>
          ) : null}
          {d.refazerHref ? (
            <a href={d.refazerHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, background: 'var(--brand)', color: '#FFFFFF', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}><RefreshCw size={14} />Refazer</a>
          ) : null}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', alignItems: mobile ? 'stretch' : 'center', gap: mobile ? 14 : 20, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, paddingRight: mobile ? 0 : 20, borderRight: mobile ? undefined : '1px solid var(--line)' }}>
          <b style={{ display: 'block', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{d.titulo}</b>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{m.tempo} · {m.tpq ?? '—'}/questão</span>
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: mobile ? 'repeat(3,1fr)' : 'repeat(5,1fr)', gap: mobile ? '4px 10px' : undefined, minWidth: mobile ? 0 : 300 }}>
          {strip.map(([l, v, c], k) => (
            <div key={l} style={{ padding: mobile ? '8px 0' : '0 18px', borderLeft: mobile || k === 0 ? undefined : '1px solid var(--line)' }}>
              <Capt>{l}</Capt>
              <b style={{ display: 'block', marginTop: 2, fontSize: 21, fontWeight: 700, color: c }}>{v}</b>
            </div>
          ))}
        </div>
      </div>
    </Card>
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
    <div role="tablist" aria-label="Seções do resultado" style={{ display: mobile ? 'grid' : 'flex', gridTemplateColumns: mobile ? 'repeat(4,1fr)' : undefined, gap: 4, padding: 4, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--line)', overflowX: 'auto' }}>
      {labels.map(([k, l, lm, Icon]) => {
        const on = rt === k
        return (
          <button key={k} role="tab" aria-selected={on} onClick={() => setRt(k)} style={{ flex: mobile ? undefined : 1, minWidth: mobile ? 0 : 'max-content', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, padding: mobile ? '0 6px' : '0 16px', borderRadius: 8, border: 0, background: on ? 'var(--brand)' : 'transparent', color: on ? '#FFFFFF' : 'var(--muted)', font: 'inherit', fontSize: mobile ? 12 : 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '.04em', transition: 'background .25s,color .25s' }}>
            {mobile ? null : <Icon size={15} />}
            {mobile ? lm : l}
          </button>
        )
      })}
    </div>
  )
}

/** Desempenho por disciplina em TABELA (Certas · Seu acerto segmentado · Turma · Dif. ±). */
function DiscTable({ d, mobile }: { d: ResultadoInternoData; mobile: boolean }) {
  const dcols = mobile ? 'minmax(0,1fr) 46px' : 'minmax(0,1.5fr) 54px minmax(0,1.2fr) 48px 56px'
  const dhead = mobile ? ['Disciplina', 'Você'] : ['Disciplina', 'Certas', 'Seu acerto', 'Turma', 'Dif.']
  if (!d.porDisciplina.length) return <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Sem dados por disciplina.</span>
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: dcols, gap: 12, padding: '0 4px 8px', borderBottom: '1px solid var(--line)' }}>
        {dhead.map((h) => <Capt key={h}>{h}</Capt>)}
      </div>
      {d.porDisciplina.map((di) => {
        const diff = typeof di.turmaPct === 'number' ? di.pct - di.turmaPct : null
        if (mobile) {
          return (
            <div key={di.nome} style={{ display: 'grid', gridTemplateColumns: dcols, gap: 12, alignItems: 'center', padding: '9px 4px', borderBottom: '1px solid var(--line)' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{di.nome}</span>
              <b style={{ fontSize: 12.5, color: notec(di.pct)[0] }}>{di.pct}%</b>
            </div>
          )
        }
        return (
          <div key={di.nome} style={{ display: 'grid', gridTemplateColumns: dcols, gap: 12, alignItems: 'center', padding: '9px 4px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{di.nome}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{di.ac}/{di.tt}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}><Segs total={10} on={Math.round(di.pct / 10)} h={6} color={notec(di.pct)[0]} /></div>
            </div>
            <b style={{ textAlign: 'right', fontSize: 12, color: notec(di.pct)[0] }}>{di.pct}%</b>
            <span style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: diff == null ? 'var(--muted)' : diff >= 0 ? '#1FA868' : '#E5484D' }}>
              {diff == null ? '—' : `${diff >= 0 ? '+' : ''}${diff}`}
            </span>
          </div>
        )
      })}
    </>
  )
}

function Geral({ d, mobile, sel, toggleSel, allSel, noneSel }: { d: ResultadoInternoData; mobile: boolean; sel: Record<number, boolean>; toggleSel: (n: number) => void; allSel: () => void; noneSel: () => void }) {
  const disc = <Card brand="meq"><Head brand="meq" icon={List} title="Desempenho por disciplina" /><DiscTable d={d} mobile={mobile} /></Card>
  const tempo = <Card brand="meq"><Head brand="meq" icon={Clock} title="Tempo por questão" /><TempoPorQuestao data={d} /></Card>
  const prioridades = <RevisarCard brand="meq" data={d} />
  const padrao = <Card brand="meq"><Head brand="meq" icon={Target} title="Padrão de respostas" /><PadraoBlock brand="meq" data={d} /></Card>
  const mapa = (
    <Card brand="meq">
      <Head brand="meq" icon={LayoutGrid} title="Gabarito" right={<span style={{ fontSize: 12, color: 'var(--muted)' }}>{d.melhor.total} itens</span>} />
      <Qmap brand="meq" data={d} cols={10} h={22} />
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}><DonutBlock data={d} size={96} /></div>
    </Card>
  )
  const dif = <Card brand="meq"><Head brand="meq" icon={Target} title="Acerto por dificuldade" /><DificuldadeBlock data={d} /></Card>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: mobile ? 14 : 16 }}>
      <AttRows brand="meq" data={d} mobile={mobile} sel={sel} onToggleSel={toggleSel} onAll={allSel} onNone={noneSel} />
      <CompareCard brand="meq" data={d} mobile={mobile} sel={sel} />
      {mobile ? (
        <>{mapa}{disc}{dif}{padrao}{tempo}{prioridades}</>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{disc}{tempo}{prioridades}{padrao}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{mapa}{dif}</div>
        </div>
      )}
    </div>
  )
}

function TabQuest({ d, mobile, qf, setFilter, pg, setPg, openMap, toggleOpen }: { d: ResultadoInternoData; mobile: boolean; qf: string; setFilter: (f: string) => void; pg: number; setPg: (p: number) => void; openMap: Record<number, boolean>; toggleOpen: (ordem: number) => void }) {
  const side = (
    <Card brand="meq" style={mobile ? undefined : { position: 'sticky', top: 90 }}>
      <Head brand="meq" icon={LayoutGrid} title="Navegador" />
      <Qmap brand="meq" data={d} cols={10} h={mobile ? 26 : 22} />
      {mobile ? null : <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}><DonutBlock data={d} size={96} /></div>}
    </Card>
  )
  const lst = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <QFilters brand="meq" data={d} qf={qf} setQf={setFilter} />
      <QList brand="meq" data={d} mobile={mobile} qf={qf} pg={pg} setPg={setPg} openMap={openMap} toggleOpen={toggleOpen} />
    </div>
  )
  if (mobile) return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{lst}{side}</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
      {side}
      {lst}
    </div>
  )
}
