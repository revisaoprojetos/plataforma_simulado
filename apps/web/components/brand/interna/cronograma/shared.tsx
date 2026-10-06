'use client'

// Átomos compartilhados do Cronograma (spec 05 §0/§3), estilizados por marca.
// Porte de `kit.Brand` (raio de card, head com "sinal"/quadrado/ícone, bar, pill, switch).
// Cada marca tem sua composição própria nos arquivos `cronograma-{revisao,vnd,meq}.tsx`.

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Clock, Check, Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown, Play, Library,
  Plus, Search, Pencil, Download, FolderInput, Gift, Flag, Target, Flame, Zap,
  Lightbulb, LayoutGrid, List, BarChart3, BookOpen, Layers, ClipboardCheck, Wand2, Info,
} from 'lucide-react'
import type { Brand } from '../interna-tokens'
import {
  TYPES, DAY_DEFAULT, OPT_DEFAULT, MEUS, WK, calcPrevia, cellKey, isMarkable, initialDone,
  PLAN_TOTAL_GOALS, PLAN_WEEKS, PLAN_CURRENT_WEEK, STEPS, ROT, DAYN, BASES, OPTS, SUBJ,
  FIRST_WEEK, MEUS_FILTER_LAB, TF_LAB, G_DAYS, G_RANGE, G_ROWS, GANTT, GANTT_AXIS,
  listItems, gridCellContent, type GoalType, type RtKey, type BsKey, type Cg, type Pv, type TfKey,
} from './mock'

export type BrandKey = 'rev' | 'vnd' | 'meq'
export const brandKey = (b: Brand): BrandKey => (b === 'revisao' ? 'rev' : b === 'vnd' ? 'vnd' : 'meq')

// Raio de card por marca (spec §0): Rev 20, VND 24, MEQ 14 — e raio genérico de controles.
export const CARD_R: Record<BrandKey, number> = { rev: 20, vnd: 24, meq: 14 }
export function ctrlR(k: BrandKey, n?: number) {
  if (n !== undefined) return n
  return { rev: 14, vnd: 16, meq: 10 }[k]
}
export function barGrad(k: BrandKey) {
  return {
    rev: 'linear-gradient(90deg,#6449E0,#8F75FF 70%,#F1C232)',
    vnd: 'linear-gradient(90deg,#1E9E5E,#3FD58A)',
    meq: 'var(--brand2)',
  }[k]
}

// ── ícones (mapeia os glyphs funcionais do gerador p/ lucide) ────────────────
export type IconName =
  | 'clock' | 'check' | 'cal' | 'cl' | 'cr' | 'down' | 'play' | 'books' | 'plus'
  | 'search' | 'edit' | 'dl' | 'folder' | 'gift' | 'flag' | 'target' | 'flame'
  | 'bolt' | 'bulb' | 'grid' | 'list' | 'chart' | 'book' | 'layers' | 'clip'
  | 'sparkle' | 'info'

const ICONS: Record<IconName, typeof Clock> = {
  clock: Clock, check: Check, cal: CalendarIcon, cl: ChevronLeft, cr: ChevronRight,
  down: ChevronDown, play: Play, books: Library, plus: Plus, search: Search,
  edit: Pencil, dl: Download, folder: FolderInput, gift: Gift, flag: Flag,
  target: Target, flame: Flame, bolt: Zap, bulb: Lightbulb, grid: LayoutGrid,
  list: List, chart: BarChart3, book: BookOpen, layers: Layers, clip: ClipboardCheck,
  sparkle: Wand2, info: Info, // NUNCA Sparkles (regra do projeto)
}

export function Ic({ n, s = 18, color, sw, style }: { n: IconName; s?: number; color?: string; sw?: number; style?: CSSProperties }) {
  const C = ICONS[n]
  return <C size={s} color={color ?? 'currentColor'} strokeWidth={sw ?? 2} style={{ flexShrink: 0, ...style }} aria-hidden />
}

// ── átomos de marca ──────────────────────────────────────────────────────────
export function Card({ k, children, pad = 20, extra, className, style }: { k: BrandKey; children: ReactNode; pad?: number | string; extra?: CSSProperties; className?: string; style?: CSSProperties }) {
  const p = typeof pad === 'number' ? `${pad}px` : pad
  const base: CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--line)',
    borderRadius: k === 'meq' ? 14 : CARD_R[k] + 2, padding: p,
    ...(k === 'meq' ? { boxShadow: '0 1px 2px rgba(16,30,54,.06)' } : null),
    ...extra,
  }
  return <div className={className} style={{ ...base, ...style }}>{children}</div>
}

/** Título de card: Rev ícone roxo solto · VND ícone em quadrado chip · MEQ "sinal" de 3 barras. */
export function Head({ k, icon, title, right, sub }: { k: BrandKey; icon: IconName; title: string; right?: ReactNode; sub?: string }) {
  let mark: ReactNode
  if (k === 'meq') {
    mark = (
      <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 14 }} aria-hidden>
        {([[6, 0.45], [10, 0.7], [14, 1]] as const).map(([h, o], i) => (
          <span key={i} style={{ display: 'block', width: 3, height: h, borderRadius: 1, background: 'var(--brand2)', opacity: o }} />
        ))}
      </span>
    )
  } else if (k === 'vnd') {
    mark = (
      <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Ic n={icon} s={16} />
      </span>
    )
  } else {
    mark = <Ic n={icon} s={18} color="var(--brand)" />
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {mark}
        <div>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: k === 'meq' ? 700 : 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{title}</h3>
          {sub ? <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginTop: 2 }}>{sub}</span> : null}
        </div>
      </div>
      {right}
    </div>
  )
}

/** CAPS 10.5 label (usada nas seções do wizard). */
export function Cap({ children }: { children: ReactNode }) {
  return <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>{children}</span>
}

export function Switch({ on, onToggle, color }: { on: boolean; onToggle: () => void; color?: string }) {
  return (
    <button type="button" onClick={onToggle} aria-label="Alternar" aria-pressed={on}
      style={{ position: 'relative', flexShrink: 0, width: 42, height: 24, padding: 0, border: 0, borderRadius: 99, background: on ? (color ?? 'var(--swOn)') : 'var(--line2)', cursor: 'pointer', transition: 'background .2s' }}>
      <span style={{ position: 'absolute', left: 3, top: 3, width: 18, height: 18, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transform: `translateX(${on ? 18 : 0}px)`, transition: 'transform .2s' }} />
    </button>
  )
}

/** Pill do tipo de meta (Aula/Flashcards/Questões/Legproc). */
export function TPill({ k, t, small }: { k: BrandKey; t: GoalType; small?: boolean }) {
  const { label, color } = TYPES[t]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: small ? 20 : 22, padding: '0 8px', borderRadius: k === 'meq' ? 5 : 99, background: `color-mix(in srgb,${color} 13%,transparent)`, color, fontSize: 10.5, fontWeight: 800, letterSpacing: '.03em', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

/** Barra de progresso em pílula (usada no plano/listas). */
export function Bar({ k, pct, color, h = 8 }: { k: BrandKey; pct: number; color?: string; h?: number }) {
  return (
    <div style={{ height: h, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
      <span style={{ display: 'block', width: `${Math.max(pct, 0)}%`, height: '100%', borderRadius: 99, background: color ?? barGrad(k), transition: 'width .5s cubic-bezier(.22,1,.36,1)' }} />
    </div>
  )
}

/** Tema das cores funcionais do wizard/grade por marca (--stDone/--swOn/--ckOn/…). */
export function cronoVars(k: BrandKey, dark: boolean): CSSProperties {
  const gv = {
    rev: dark ? ['rgba(241,194,50,.08)', '#E9E3FF'] : ['#FBF3D5', '#4B3A8C'],
    vnd: dark ? ['rgba(232,200,119,.08)', '#F1E4C0'] : ['#FBF4E2', '#0B4A2E'],
    meq: dark ? ['rgba(94,206,240,.06)', '#DCEBFF'] : ['#F2F6FD', '#25356F'],
  }[k]
  const brandCfg = {
    rev: { stDone: '#22B573', stCur: '#5B3FD0', dOn: '#5B3FD0', dOnSh: '0 8px 16px -10px rgba(91,63,208,.9)', swOn: '#5B3FD0', ckOn: '#5B3FD0', calOn: '#5B3FD0' },
    vnd: { stDone: '#16804F', stCur: '#D8B45A', dOn: '#0F7A44', dOnSh: '0 4px 0 #0B4A2E', swOn: '#0F7A44', ckOn: '#1FA868', calOn: '#0F7A44' },
    meq: { stDone: '#2EC77A', stCur: 'var(--brand2)', dOn: 'var(--brand2)', dOnSh: 'none', swOn: 'var(--brand2)', ckOn: 'var(--brand2)', calOn: 'var(--brand2)' },
  }[k]
  return {
    '--gCell': gv[0], '--gInk': gv[1], '--gDone': dark ? 'rgba(34,181,115,.16)' : '#E3F6EC',
    '--stDone': brandCfg.stDone, '--stCur': brandCfg.stCur, '--stCurInk': '#FFFFFF', '--stTodo': 'var(--surface2)',
    '--dOn': brandCfg.dOn, '--dOnInk': '#FFFFFF', '--dOnSh': brandCfg.dOnSh,
    '--swOn': brandCfg.swOn, '--ckOn': brandCfg.ckOn, '--calOn': brandCfg.calOn, '--calOnInk': '#FFFFFF',
    '--sub': 'var(--muted)',
  } as CSSProperties
}

// CSS global (keyframes) injetado 1x por marca com prefixo próprio. Respeita reduced-motion.
export function cssFor(prefix: string) {
  return `
.${prefix} .opt{transition:transform .2s,border-color .2s,background .2s}
.${prefix} .opt:hover{transform:translateY(-2px);border-color:var(--selLine)}
.${prefix} .gobtn{position:relative;overflow:hidden}
.${prefix} .gobtn::after{content:"";position:absolute;top:0;bottom:0;left:-40%;width:30%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.45),transparent);transform:skewX(-18deg);animation:${prefix}-goshine 3s ease-in-out infinite}
@keyframes ${prefix}-goshine{0%,60%{left:-40%}100%{left:130%}}
.${prefix} .gcell{transition:background .25s}
.${prefix} .gcell:hover{filter:brightness(.96)}
.${prefix} .gcell:hover .gempty{opacity:.8}
.${prefix} .gcell:active{transform:scale(.98)}
.${prefix} .gpop{animation:${prefix}-gpop .35s cubic-bezier(.34,1.56,.64,1)}
@keyframes ${prefix}-gpop{from{transform:scale(0)}}
.${prefix} .vgin{animation:${prefix}-vgin .45s cubic-bezier(.22,1,.36,1) both}
@keyframes ${prefix}-vgin{from{opacity:0;transform:translateX(-24px) scale(.985)}}
.${prefix} .vlin{animation:${prefix}-vlin .45s cubic-bezier(.22,1,.36,1) both}
@keyframes ${prefix}-vlin{from{opacity:0;transform:translateX(24px) scale(.985)}}
.${prefix} .gwin{animation:${prefix}-gwin .35s cubic-bezier(.22,1,.36,1) both}
@keyframes ${prefix}-gwin{from{opacity:0;transform:translateY(8px)}}
.${prefix} .pv{animation:${prefix}-pvin .35s cubic-bezier(.22,1,.36,1)}
@keyframes ${prefix}-pvin{from{opacity:0;transform:translateY(6px)}}
.${prefix} .barAnim{transform-origin:0 50%;animation:${prefix}-bar 1.2s cubic-bezier(.22,1,.36,1) .3s both}
@keyframes ${prefix}-bar{from{transform:scaleX(0)}}
.${prefix} .rowh{transition:background .2s}
.${prefix} .rowh:hover{background:var(--surface2)}
.${prefix} .ibtn{transition:border-color .2s,background .2s,transform .2s}
.${prefix} .ibtn:hover{border-color:var(--selLine)}
.${prefix} .hs{scrollbar-width:thin}
@media (prefers-reduced-motion: reduce){
  .${prefix} .gobtn::after{animation:none;display:none}
  .${prefix} .gpop,.${prefix} .vgin,.${prefix} .vlin,.${prefix} .gwin,.${prefix} .pv,.${prefix} .barAnim{animation:none}
}
`
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado do Cronograma (fonte única da verdade). Grade e lista compartilham o
// mesmo mapa `cells` por chave `${week}${row}${day}` → progresso global/semana
// atualizam na hora. Porte de `cronograma.py::logic`.
// ─────────────────────────────────────────────────────────────────────────────
export interface CronogramaState {
  // navegação de área + wizard
  cg: Cg
  setCg: (v: Cg) => void
  gs: 1 | 2 | 3 | 4
  setGs: (v: 1 | 2 | 3 | 4) => void
  goGerar: () => void
  goMeus: () => void
  openPlan: () => void
  genDone: () => void
  genNew: boolean
  // passo 1
  rt: RtKey; setRt: (v: RtKey) => void
  weekdays: boolean[]; toggleDay: (d: number) => void
  // passo 2
  bs: BsKey; setBs: (v: BsKey) => void
  // passo 3
  sd: number; setSd: (v: number) => void
  opts: boolean[]; toggleOpt: (i: number) => void
  // prévia calculada
  previa: ReturnType<typeof calcPrevia>
  // meus
  mf: 'todos' | 'ativos' | 'arq'; setMf: (v: 'todos' | 'ativos' | 'arq') => void
  visibleMeus: boolean[]
  // plano: visualização
  pv: Pv; setPv: (v: Pv) => void
  // plano: grade de semanas
  gw: number; setGw: (v: number) => void
  gwPrev: () => void; gwNext: () => void
  gridRows: boolean[]; toggleGridRow: (r: number) => void // linhas visíveis (Aula/Flash/Q/Legproc)
  hd: boolean; setHd: (v: boolean) => void // esmaecer / ocultar concluídas
  // células (compartilhadas grade↔lista)
  cells: Record<string, boolean>
  isDone: (key: string) => boolean
  toggleCell: (key: string) => void
  markWeek: (w: number) => void
  clearWeek: (w: number) => void
  weekDone: (w: number) => number
  weekTotal: (w: number) => number
  // lista: acordeões + filtro de tipo
  tf: TfKey; setTf: (v: TfKey) => void
  openWeeks: Record<number, boolean>; toggleWeek: (w: number) => void; closeAllWeeks: () => void
  // progresso global
  totalDone: number
  pct: number
}

export function useCronogramaState(initialTab?: string): CronogramaState {
  const initCg: Cg = initialTab === 'meus' ? 'meus' : initialTab === 'plano' ? 'plano' : 'gerar'
  const [cg, setCg] = useState<Cg>(initCg)
  const [gs, setGs] = useState<1 | 2 | 3 | 4>(1)
  const [genNew, setGenNew] = useState(false)

  const [rt, setRt] = useState<RtKey>('2h')
  const [weekdays, setWeekdays] = useState<boolean[]>([...DAY_DEFAULT])
  const [bs, setBs] = useState<BsKey>('pge')
  const [sd, setSd] = useState(12)
  const [opts, setOpts] = useState<boolean[]>([...OPT_DEFAULT])

  const [mf, setMf] = useState<'todos' | 'ativos' | 'arq'>('todos')
  const [pv, setPv] = useState<Pv>('grade')
  const [gw, setGw] = useState(1)
  const [gridRows, setGridRows] = useState<boolean[]>([true, true, true, true])
  const [hd, setHd] = useState(false)
  const [cells, setCells] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {}
    for (let w = 1; w <= 6; w++) for (let r = 0; r < 4; r++) for (let d = 0; d < 6; d++) {
      if (isMarkable(w, r) && initialDone(w, r, d)) o[cellKey(w, r, d)] = true
    }
    return o
  })
  const [tf, setTf] = useState<TfKey>('all')
  const [openWeeks, setOpenWeeks] = useState<Record<number, boolean>>({ 1: true })

  const previa = useMemo(() => calcPrevia(rt, bs, weekdays, sd, opts), [rt, bs, weekdays, sd, opts])

  const isDone = (key: string) => {
    const [w, r, d] = [Number(key[0]), Number(key[1]), Number(key[2])]
    if (!isMarkable(w, r)) return false
    return cells[key] ?? initialDone(w, r, d)
  }
  const toggleCell = (key: string) => {
    const [w, r] = [Number(key[0]), Number(key[1])]
    if (!isMarkable(w, r)) return
    setCells((c) => ({ ...c, [key]: !isDone(key) }))
  }
  const markWeek = (w: number) => setCells((c) => {
    const n = { ...c }
    for (let r = 0; r < 4; r++) for (let d = 0; d < 6; d++) if (isMarkable(w, r)) n[cellKey(w, r, d)] = true
    return n
  })
  const clearWeek = (w: number) => setCells((c) => {
    const n = { ...c }
    for (let r = 0; r < 4; r++) for (let d = 0; d < 6; d++) n[cellKey(w, r, d)] = false
    return n
  })
  const weekTotal = (w: number) => {
    let t = 0
    for (let r = 0; r < 4; r++) for (let d = 0; d < 6; d++) if (isMarkable(w, r)) t++
    return t
  }
  const weekDone = (w: number) => {
    let n = 0
    for (let r = 0; r < 4; r++) for (let d = 0; d < 6; d++) if (isMarkable(w, r) && isDone(cellKey(w, r, d))) n++
    return n
  }

  const totalDone = useMemo(() => {
    let n = 0
    for (let w = 1; w <= 6; w++) n += weekDone(w)
    return n
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells])
  const pct = (totalDone / PLAN_TOTAL_GOALS) * 100

  const visibleMeus = MEUS.map((m) => mf === 'todos' || (mf === 'ativos' ? m.status === 'ativo' : m.status === 'arq'))

  return {
    cg, setCg,
    gs, setGs,
    goGerar: () => { setCg('gerar'); setGs(1) },
    goMeus: () => setCg('meus'),
    openPlan: () => setCg('plano'),
    genDone: () => { setCg('plano'); setGenNew(true) },
    genNew,
    rt, setRt,
    weekdays, toggleDay: (d) => setWeekdays((w) => w.map((v, i) => (i === d ? !v : v))),
    bs, setBs,
    sd, setSd,
    opts, toggleOpt: (i) => setOpts((o) => o.map((v, k) => (k === i ? !v : v))),
    previa,
    mf, setMf, visibleMeus,
    pv, setPv,
    gw, setGw,
    gwPrev: () => setGw((w) => Math.max(1, w - 1)),
    gwNext: () => setGw((w) => Math.min(6, w + 1)),
    gridRows, toggleGridRow: (r) => setGridRows((g) => g.map((v, i) => (i === r ? !v : v))),
    hd, setHd,
    cells, isDone, toggleCell, markWeek, clearWeek, weekDone, weekTotal,
    tf, setTf,
    openWeeks, toggleWeek: (w) => setOpenWeeks((o) => ({ ...o, [w]: !o[w] })), closeAllWeeks: () => setOpenWeeks({}),
    totalDone, pct,
  }
}

// Helpers de formatação reusados pelas marcas
export function fmtPct(pct: number) {
  return pct < 1 ? '<1%' : pct.toFixed(1).replace('.', ',') + '%'
}
export function nbr(n: number) {
  return n.toLocaleString('pt-BR')
}
export const WK_LIST = WK

// ═════════════════════════════════════════════════════════════════════════════
// PEÇAS COMPOSTAS (estilizadas por marca) — wizard, meus, grade e lista.
// ═════════════════════════════════════════════════════════════════════════════

type Shared = { k: BrandKey; mobile: boolean; st: CronogramaState }

// ── Abas Gerar/Meus ──────────────────────────────────────────────────────────
export function CgTabs({ k, mobile, st, onDark }: Shared & { onDark?: boolean }) {
  const active = st.cg === 'gerar' ? 'gerar' : 'meus' // plano mantém "Meus" ativo
  const labels = mobile ? ['Gerar', 'Meus'] : ['Gerar cronograma', 'Meus cronogramas']
  const icons: IconName[] = ['sparkle', 'list']
  const tOn = onDark ? 'rgba(255,255,255,.14)' : 'var(--tOn)'
  const tOnInk = onDark ? '#FFFFFF' : 'var(--tOnInk)'
  const off = onDark ? 'rgba(255,255,255,.78)' : 'var(--sub)'
  return (
    <div role="tablist" className="hs" style={{ display: mobile ? 'grid' : 'inline-flex', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : undefined, width: mobile ? '100%' : undefined, gap: 3, padding: 4, borderRadius: k === 'meq' ? 11 : 15, background: onDark ? 'rgba(255,255,255,.1)' : 'var(--tBg)' }}>
      {(['gerar', 'meus'] as const).map((o, i) => {
        const on = active === o
        return (
          <button key={o} type="button" role="tab" aria-selected={on} className="ptab"
            onClick={() => (o === 'gerar' ? st.goGerar() : st.goMeus())}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, whiteSpace: 'nowrap', height: mobile ? 38 : 40, padding: mobile ? '0 10px' : '0 14px', border: 0, borderRadius: k === 'meq' ? 8 : 11, background: on ? tOn : 'transparent', color: on ? tOnInk : off, fontSize: mobile ? 12.5 : 13.5, fontWeight: 700, cursor: 'pointer', transition: 'background .25s,color .25s' }}>
            {!mobile && <Ic n={icons[i]} s={15} />}
            {labels[i]}
            {!mobile && o === 'meus' && (
              <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: onDark ? 'rgba(255,255,255,.18)' : 'var(--chip)', color: on ? tOnInk : off }}>4</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Stepper (horizontal / vertical) ──────────────────────────────────────────
export function Stepper({ k, mobile, st, vertical }: Shared & { vertical?: boolean }) {
  const step = st.gs
  return (
    <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: vertical ? undefined : 'center', gap: vertical ? 0 : mobile ? 8 : 12 }}>
      {STEPS.map((s, idx) => {
        const kk = idx + 1
        const done = kk < step, cur = kk === step
        const bg = done ? 'var(--stDone)' : cur ? 'var(--stCur)' : 'var(--stTodo)'
        const ink = kk <= step ? 'var(--stCurInk)' : 'var(--muted)'
        const circ = (
          <span style={{ width: mobile ? 30 : 34, height: mobile ? 30 : 34, borderRadius: k === 'meq' ? 8 : '50%', background: bg, color: ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0, transition: 'background .3s', ...(k === 'vnd' ? { boxShadow: '0 3px 0 rgba(0,0,0,.18)' } : null) }}>
            {done ? <Ic n="check" s={15} sw={3} /> : kk}
          </span>
        )
        if (vertical) {
          return (
            <div key={kk}>
              <button type="button" onClick={() => st.setGs(kk as 1 | 2 | 3 | 4)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', border: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer', position: 'relative' }}>
                {circ}
                <span style={{ lineHeight: 1.25 }}>
                  <b style={{ display: 'block', fontSize: 13.5, color: cur ? 'var(--ink)' : 'var(--muted)' }}>{s.title}</b>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{s.sub}</span>
                </span>
              </button>
              {kk < 4 && <span style={{ display: 'block', width: 2, height: 16, marginLeft: 16, borderRadius: 2, background: done ? 'var(--stDone)' : 'var(--line2)' }} />}
            </div>
          )
        }
        return (
          <div key={kk} style={{ display: 'contents' }}>
            <button type="button" onClick={() => st.setGs(kk as 1 | 2 | 3 | 4)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 0, border: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer', flexShrink: 0 }}>
              {circ}
              {!mobile && (
                <span style={{ lineHeight: 1.2 }}>
                  <b style={{ display: 'block', fontSize: 13, color: cur ? 'var(--ink)' : 'var(--muted)' }}>{s.title}</b>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{s.sub}</span>
                </span>
              )}
            </button>
            {kk < 4 && <span style={{ flex: 1, minWidth: 14, height: 3, borderRadius: 3, background: done ? 'var(--stDone)' : 'var(--line2)' }} />}
          </div>
        )
      })}
    </div>
  )
}

// ── Passo 1 ──────────────────────────────────────────────────────────────────
export function Step1({ k, mobile, st }: Shared) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <Cap>Quanto tempo por dia?</Cap>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${mobile ? 2 : 4},1fr)`, gap: 10, marginTop: 10 }}>
          {ROT.map((o) => {
            const on = st.rt === o.key
            return (
              <button key={o.key} type="button" onClick={() => st.setRt(o.key)} className="opt"
                style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: mobile ? 14 : 18, borderRadius: ctrlR(k), border: `${k === 'vnd' ? 2 : 1.5}px solid ${on ? 'var(--selLine)' : 'var(--line)'}`, ...(k === 'vnd' ? { borderBottomWidth: 5 } : null), background: on ? 'var(--chip)' : 'var(--surface)', color: on ? (k === 'meq' ? 'var(--brand2)' : 'var(--brand)') : 'var(--ink)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                {o.popular && (
                  <span style={{ position: 'absolute', right: 10, top: 10, height: 20, padding: '0 7px', borderRadius: 99, ...popularStyle(k), fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', display: 'inline-flex', alignItems: 'center' }}>POPULAR</span>
                )}
                <span style={{ color: 'inherit', opacity: 0.8 }}><Ic n="clock" s={20} /></span>
                <b style={{ marginTop: 6, fontSize: mobile ? 20 : 24, fontWeight: 800, letterSpacing: '-0.03em' }}>{o.big}</b>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{o.per} · {o.wk}</span>
                <span style={{ marginTop: 4, fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>{o.sub}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <Cap>Em quais dias você estuda?</Cap>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {DAYN.map((n, d) => {
            const on = st.weekdays[d]
            return (
              <button key={d} type="button" onClick={() => st.toggleDay(d)}
                style={{ flex: 1, minWidth: 0, height: mobile ? 44 : 52, border: 0, borderRadius: ctrlR(k, k === 'meq' ? 8 : 12), background: on ? 'var(--dOn)' : 'var(--surface2)', color: on ? 'var(--dOnInk)' : 'var(--muted)', boxShadow: on ? 'var(--dOnSh)' : 'none', font: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', transition: 'background .2s' }}>{n}</button>
            )
          })}
        </div>
        {st.previa.warn && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(229,72,77,.1)', color: '#E5484D', fontSize: 12.5, fontWeight: 600 }}>
            <Ic n="info" s={15} />Escolha pelo menos 3 dias para um ritmo consistente.
          </div>
        )}
        <span style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>{st.previa.days} dias por semana · {st.previa.perWeek}</span>
      </div>
    </div>
  )
}
function popularStyle(k: BrandKey): CSSProperties {
  if (k === 'rev') return { background: '#F1C232', color: '#2A1A55' }
  if (k === 'vnd') return { background: 'linear-gradient(180deg,#F1D48A,#D8B45A)', color: '#2A1F02' }
  return { background: 'var(--brand2)', color: '#FFFFFF' }
}

// ── Passo 2 ──────────────────────────────────────────────────────────────────
export function Step2({ k, mobile, st }: Shared) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Cap>Cronogramas liberados para você</Cap>
      {BASES.map((b) => {
        const on = st.bs === b.key
        return (
          <button key={b.key} type="button" onClick={() => st.setBs(b.key)} className="opt"
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: ctrlR(k), border: `${k === 'vnd' ? 2 : 1.5}px solid ${on ? 'var(--selLine)' : 'var(--line)'}`, ...(k === 'vnd' ? { borderBottomWidth: 5 } : null), background: on ? 'var(--chip)' : 'var(--surface)', color: on ? (k === 'meq' ? 'var(--brand2)' : 'var(--brand)') : 'var(--ink)', font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
            <span style={{ width: 48, height: 48, borderRadius: k === 'rev' ? '50%' : 12, background: b.color, color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="books" s={22} /></span>
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
              <b style={{ display: 'block', fontSize: 15 }}>{b.title}</b>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{b.sub}</span>
            </span>
            <span style={{ textAlign: 'right', lineHeight: 1.3, flexShrink: 0 }}>
              <span style={{ display: 'inline-flex', height: 20, padding: '0 8px', borderRadius: 99, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 10.5, fontWeight: 800, alignItems: 'center', textTransform: 'uppercase' }}>via {b.via}</span>
              {!mobile && <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>{b.since}</span>}
            </span>
          </button>
        )
      })}
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>A ordem das matérias segue o edital mais recente e o peso de cada uma nas provas.</span>
    </div>
  )
}

// ── Passo 3 (calendário Out 2026 + switches) ─────────────────────────────────
export function Calendar({ k, st }: { k: BrandKey; st: CronogramaState }) {
  // Outubro 2026 começa numa quinta → 3 células vazias (Seg..Qua)
  const cells: ReactNode[] = []
  for (let i = 0; i < 3; i++) cells.push(<span key={`e${i}`} />)
  for (let d = 1; d <= 31; d++) {
    if (d < 5) {
      cells.push(<span key={d} style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--muted)', opacity: 0.5 }}>{d}</span>)
    } else {
      const on = st.sd === d
      cells.push(
        <button key={d} type="button" onClick={() => st.setSd(d)}
          style={{ height: 38, border: 0, borderRadius: k === 'meq' ? 8 : '50%', background: on ? 'var(--calOn)' : 'transparent', color: on ? 'var(--calOnInk)' : 'var(--ink)', font: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{d}</button>,
      )
    }
  }
  return (
    <div style={{ padding: 14, borderRadius: ctrlR(k), border: '1px solid var(--line)', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <b style={{ fontSize: 14, color: 'var(--ink)' }}>Outubro 2026</b>
        <span style={{ display: 'inline-flex', gap: 4, color: 'var(--muted)' }}><Ic n="cl" s={16} /><Ic n="cr" s={16} /></span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => <span key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{d}</span>)}
        {cells}
      </div>
    </div>
  )
}

export function Step3({ k, mobile, st }: Shared) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)', gap: 22, alignItems: 'start' }}>
      <div>
        <Cap>Quando começar?</Cap>
        <div style={{ marginTop: 10 }}><Calendar k={k} st={st} /></div>
        <span style={{ display: 'block', marginTop: 8, fontSize: 12.5, color: 'var(--muted)' }}>Início: <b style={{ color: 'var(--ink)' }}>{st.previa.startDay}</b></span>
      </div>
      <div>
        <Cap>Ajustes do plano</Cap>
        <div style={{ marginTop: 6 }}>
          {OPTS.map((o, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)' }}>{o.title}</b>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{o.desc}</span>
              </div>
              <Switch on={st.opts[i]} onToggle={() => st.toggleOpt(i)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Barras por matéria (passo 4 + lateral MEQ) ───────────────────────────────
export function SubjBars() {
  return (
    <>
      {SUBJ.map((s) => (
        <div key={s.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 36px', gap: 10, alignItems: 'center', marginTop: 8 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{s.name}</span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
              <span className="barAnim" style={{ display: 'block', height: '100%', width: `${Math.round(s.pct * 3.2)}%`, borderRadius: 99, background: s.color }} />
            </div>
          </div>
          <b style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>{s.pct}%</b>
        </div>
      ))}
    </>
  )
}

// ── Passo 4 ──────────────────────────────────────────────────────────────────
export function Step4({ k, mobile, st }: Shared) {
  const kp = (v: string, l: string) => (
    <div style={{ padding: 14, borderRadius: ctrlR(k, 12), background: 'var(--surface2)' }}>
      <b style={{ display: 'block', fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{v}</b>
      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l}</span>
    </div>
  )
  const p = st.previa
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${mobile ? 2 : 4},1fr)`, gap: 8 }}>
        {kp(String(p.weeks), 'semanas')}{kp(p.activities, 'atividades')}{kp(p.totalH, 'de estudo')}{kp(p.end, 'término previsto')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)', gap: 18 }}>
        <div><Cap>Como o tempo será dividido</Cap><SubjBars /></div>
        <div>
          <Cap>Prévia da semana 1</Cap>
          <div style={{ marginTop: 6 }}>
            {FIRST_WEEK.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                <b style={{ width: 34, fontSize: 12, color: 'var(--muted)' }}>{r.day}</b>
                <TPill k={k} t={r.type} small />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{r.dur}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: '12px 14px', borderRadius: ctrlR(k, 12), background: 'var(--surface2)', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
        <b style={{ color: 'var(--ink)' }}>{p.base}</b> · {p.hours}/dia · {p.daysTxt} · começa {p.start} · {p.contentWeeks} semanas de conteúdo + {p.reviewWeeks} de revisão
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Cap>Nome do cronograma</Cap>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, height: 46, padding: '0 14px', borderRadius: ctrlR(k, 12), border: '1.5px solid var(--line2)', background: 'var(--surface)' }}>
          <Ic n="edit" s={15} color="var(--muted)" />
          <input type="text" defaultValue={p.name} key={p.name} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: 'inherit', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }} />
        </span>
      </label>
    </div>
  )
}

export function WizSteps({ k, mobile, st }: Shared) {
  return (
    <>
      {st.gs === 1 && <Step1 k={k} mobile={mobile} st={st} />}
      {st.gs === 2 && <Step2 k={k} mobile={mobile} st={st} />}
      {st.gs === 3 && <Step3 k={k} mobile={mobile} st={st} />}
      {st.gs === 4 && <Step4 k={k} mobile={mobile} st={st} />}
    </>
  )
}

export function WizNav({ k, st }: { k: BrandKey; st: CronogramaState }) {
  const nextLab = ['', 'Escolher o cronograma', 'Definir início', 'Ver prévia', ''][st.gs]
  const nextSty: CSSProperties = k === 'rev'
    ? { background: '#5B3FD0', color: '#FFFFFF', boxShadow: '0 10px 20px -12px rgba(91,63,208,.9)' }
    : k === 'vnd' ? { background: 'linear-gradient(180deg,#F1D48A,#D8B45A)', color: '#2A1F02', boxShadow: '0 4px 0 #9A7414' }
      : { background: 'var(--brand)', color: '#FFFFFF' }
  const genSty: CSSProperties = k === 'rev'
    ? { background: '#F1C232', color: '#2A1A55' }
    : k === 'vnd' ? { background: 'linear-gradient(180deg,#F1D48A,#D8B45A)', color: '#2A1F02', boxShadow: '0 4px 0 #9A7414' }
      : { background: 'var(--brand)', color: '#FFFFFF' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>Passo {st.gs} de 4</span>
      <div style={{ display: 'flex', gap: 8 }}>
        {st.gs > 1 && (
          <button type="button" onClick={() => st.setGs(Math.max(1, st.gs - 1) as 1 | 2 | 3 | 4)} className="ibtn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 46, padding: '0 16px', borderRadius: ctrlR(k, 12), border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            <Ic n="cl" s={15} />Voltar
          </button>
        )}
        {st.gs < 4 && (
          <button type="button" onClick={() => st.setGs(Math.min(4, st.gs + 1) as 1 | 2 | 3 | 4)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 20px', border: 0, borderRadius: ctrlR(k, 12), ...nextSty, font: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            {nextLab}<Ic n="cr" s={15} />
          </button>
        )}
        {st.gs === 4 && (
          <button type="button" onClick={st.genDone} className="gobtn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 48, padding: '0 22px', border: 0, borderRadius: ctrlR(k, 12), ...genSty, font: 'inherit', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
            <Ic n="sparkle" s={16} />Gerar cronograma
          </button>
        )}
      </div>
    </div>
  )
}

// ── Resumo lateral (tabela) ──────────────────────────────────────────────────
export function SummaryRows({ st, darkBg }: { st: CronogramaState; darkBg?: boolean }) {
  const p = st.previa
  const rows: Array<[string, string]> = [
    ['Cronograma', p.base], ['Rotina', `${p.hours}/dia · ${p.days} dias`], ['Início', p.start],
    ['Duração', `${p.weeks} semanas`], ['Atividades', p.activities], ['Término previsto', p.end],
  ]
  return (
    <>
      {rows.map(([l, v]) => (
        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: `1px solid ${darkBg ? 'rgba(255,255,255,.12)' : 'var(--line)'}`, fontSize: 12.5 }}>
          <span style={{ color: darkBg ? 'rgba(255,255,255,.7)' : 'var(--muted)' }}>{l}</span>
          <b style={{ color: darkBg ? '#FFFFFF' : 'var(--ink)', textAlign: 'right' }}>{v}</b>
        </div>
      ))}
    </>
  )
}

// ── Dica da Revisão ──────────────────────────────────────────────────────────
export function RevTip() {
  return (
    <div style={{ display: 'flex', gap: 12, padding: 16, borderRadius: 18, background: 'var(--peachBg)', border: '1px solid rgba(241,194,50,.45)' }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: '#F1C232', color: '#2A1A55', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="bulb" s={19} /></span>
      <div>
        <b style={{ display: 'block', fontSize: 14, color: 'var(--ink)' }}>Dica da Revisão</b>
        <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--muted)' }}>Marque a meta assim que terminar: o cronograma reorganiza o que ficou para trás sem mexer nas revisões.</span>
      </div>
    </div>
  )
}

// ── Liberados para você ──────────────────────────────────────────────────────
export function Liberados({ k, st }: { k: BrandKey; st: CronogramaState }) {
  return (
    <Card k={k} pad={18}>
      <Head k={k} icon="gift" title="Liberados para você" sub="3 cronogramas base disponíveis" />
      {BASES.map((b) => (
        <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
          <span style={{ width: 38, height: 38, borderRadius: k === 'rev' ? '50%' : 10, background: `color-mix(in srgb,${b.color} 15%,transparent)`, color: b.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="books" s={17} /></span>
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
            <b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)' }}>{b.title}</b>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>via {b.via} · {b.since}</span>
          </div>
          <button type="button" onClick={st.goGerar} className="ibtn" style={{ height: 30, padding: '0 11px', borderRadius: k === 'meq' ? 8 : 99, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 12, fontWeight: 700, color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', cursor: 'pointer' }}>Usar</button>
        </div>
      ))}
    </Card>
  )
}

// ── Lista "Meus cronogramas" ─────────────────────────────────────────────────
export function MeusList({ k, mobile, st }: Shared) {
  const iconBox: CSSProperties = k === 'rev' ? { borderRadius: 12, background: 'var(--chip)', color: 'var(--brand)' }
    : k === 'vnd' ? { borderRadius: 14, background: 'linear-gradient(180deg,#F1D48A,#D8B45A)', color: '#2A1F02', boxShadow: '0 3px 0 #9A7414' }
      : { borderRadius: 9, background: 'color-mix(in srgb,var(--brand2) 12%,transparent)', color: 'var(--brand2)' }
  return (
    <Card k={k} pad={0} extra={{ overflow: 'hidden' }}>
      <div style={{ padding: '18px 18px 0' }}>
        <Head k={k} icon="cal" title="Meus cronogramas" sub="Tudo o que você gerou, com data e hora · abra para ver a grade e marcar metas"
          right={<button type="button" onClick={st.goGerar} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: k === 'meq' ? 'var(--brand2)' : 'var(--brand)', border: 0, background: 'none', cursor: 'pointer' }}><Ic n="plus" s={14} />Novo</button>} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', borderRadius: ctrlR(k, 11), border: '1px solid var(--line)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 13, flex: 1, minWidth: 200 }}>
            <Ic n="search" s={15} />Buscar pelo nome ou pelo cronograma
          </div>
          <div className="hs" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {(['todos', 'ativos', 'arq'] as const).map((o) => {
              const on = st.mf === o
              return (
                <button key={o} type="button" onClick={() => st.setMf(o)} style={{ height: 32, padding: '0 12px', borderRadius: k === 'meq' ? 8 : 99, border: '1px solid var(--line)', background: on ? 'var(--fOn)' : 'transparent', color: on ? 'var(--fOnInk)' : 'var(--sub)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{MEUS_FILTER_LAB[o]}</button>
              )
            })}
          </div>
        </div>
      </div>
      {MEUS.map((m, i) => {
        if (!st.visibleMeus[i]) return null
        const pct = (m.done / m.total) * 100
        let chip: [string, string, string]
        if (i === 0) chip = ['Em andamento', k === 'meq' ? 'var(--brand2)' : 'var(--brand)', 'var(--chip)']
        else if (m.status === 'ativo') chip = ['Ativo', '#1FA868', 'rgba(31,168,104,.12)']
        else chip = ['Arquivado', 'var(--muted)', 'var(--surface2)']
        return (
          <div key={i} className="rowh" onClick={st.openPlan} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: `14px ${mobile ? 12 : 16}px`, borderTop: '1px solid var(--line)', cursor: 'pointer' }}>
            <span style={{ width: 42, height: 42, ...iconBox, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="cal" s={19} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <b style={{ fontSize: 15, color: 'var(--ink)' }}>{m.name}</b>
                <span style={{ height: 20, padding: '0 8px', borderRadius: 99, background: chip[2], color: chip[1], fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>{chip[0]}</span>
              </div>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{m.base} · {m.sub}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, maxWidth: 360 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${Math.max(pct, 1)}%`, borderRadius: 99, background: barGrad(k) }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{m.done}/{m.total} metas</span>
              </div>
            </div>
            {!mobile && (
              <div style={{ textAlign: 'right', lineHeight: 1.3, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{m.date}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{m.hour}</span>
              </div>
            )}
            {!mobile && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {(['edit', 'dl', 'folder'] as IconName[]).map((icn, j) => (
                  <span key={j} className="ibtn" onClick={(e) => e.stopPropagation()} title={['Renomear', 'Salvar em PDF', 'Arquivar'][j]} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--line)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic n={icn} s={14} /></span>
                ))}
              </div>
            )}
            <span style={{ color: 'var(--muted)', display: 'inline-flex' }}><Ic n="cr" s={16} /></span>
          </div>
        )
      })}
    </Card>
  )
}

// ── Stats "Meus" por marca ───────────────────────────────────────────────────
export function MeusStats({ k, mobile }: { k: BrandKey; mobile: boolean }) {
  const stats: Record<BrandKey, Array<[IconName, string, string]>> = {
    rev: [['cal', '4', 'salvos'], ['check', '3', 'ativos'], ['target', '2', 'metas concluídas'], ['clock', 'Hoje', 'próxima meta']],
    vnd: [['cal', '4', 'cronogramas'], ['flame', '0', 'dias seguidos'], ['bolt', '+10 XP', 'esta semana'], ['gift', '2', 'baús abertos']],
    meq: [['cal', '4', 'salvos'], ['check', '75%', 'aderência semanal'], ['clock', '3h', 'estudadas na semana'], ['target', '5/89', 'semana atual']],
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${mobile ? 2 : 4},1fr)`, gap: 10 }}>
      {stats[k].map(([icn, v, l], i) => {
        if (k === 'meq') {
          return (
            <div key={i} style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 1px 2px rgba(16,30,54,.06)' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{l}<span style={{ color: 'var(--brand2)' }}><Ic n={icn} s={15} /></span></span>
              <b style={{ display: 'block', marginTop: 4, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{v}</b>
            </div>
          )
        }
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: k === 'vnd' ? 18 : 16, border: k === 'vnd' ? '2px solid var(--line)' : '1px solid var(--line)', ...(k === 'vnd' ? { borderBottomWidth: 5 } : null), background: 'var(--surface)' }}>
            <span style={{ width: k === 'vnd' ? 40 : 38, height: k === 'vnd' ? 40 : 38, borderRadius: 12, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n={icn} s={k === 'vnd' ? 18 : 17} /></span>
            <div style={{ lineHeight: 1.2 }}>
              <b style={{ display: 'block', fontSize: 19, fontWeight: 800, color: 'var(--ink)' }}>{v}</b>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Plano: cabeçalho / KPIs / progresso ──────────────────────────────────────
export function PlanHead({ k, mobile, st }: Shared) {
  const hk = k === 'meq' ? 'var(--head)' : 'var(--ink)', sk = k === 'meq' ? 'var(--sub)' : 'var(--muted)'
  const btn = (icn: IconName, t: string) => (
    <span className="ibtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 13px', borderRadius: ctrlR(k, 11), border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer' }}><Ic n={icn} s={15} />{t}</span>
  )
  return (
    <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', alignItems: mobile ? undefined : 'flex-end', justifyContent: mobile ? undefined : 'space-between', gap: mobile ? 12 : 16 }}>
      <div>
        <button type="button" onClick={st.goMeus} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: sk, border: 0, background: 'none', cursor: 'pointer' }}><Ic n="cl" s={14} />Meus cronogramas</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: mobile ? 24 : 30, fontWeight: 800, letterSpacing: '-0.04em', color: hk }}>2H</h2>
          <span style={{ color: sk, display: 'inline-flex' }}><Ic n="edit" s={16} /></span>
          {st.genNew && (
            <span style={{ height: 24, padding: '0 10px', borderRadius: 99, background: 'rgba(31,168,104,.14)', color: '#1FA868', fontSize: 11.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Ic n="check" s={12} sw={3} />Cronograma gerado agora</span>
          )}
        </div>
        <span style={{ fontSize: 13, color: sk }}>PGE/PGM Completo · 2h por dia · Seg a Sáb · gerado em 02/09/2026 às 15:12</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{btn('dl', 'Salvar em PDF')}{btn('cal', 'Exportar agenda')}{btn('folder', 'Arquivar')}</div>
    </div>
  )
}

export function PlanKpis({ k, mobile }: { k: BrandKey; mobile: boolean }) {
  const data: Array<[string, string, IconName]> = [['89', 'semanas', 'cal'], ['6', 'dias por semana', 'clock'], ['743', 'atividades', 'list'], ['20/05/2028', 'término previsto', 'flag']]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${mobile ? 2 : 4},1fr)`, gap: 10 }}>
      {data.map(([v, l, icn], i) => {
        if (k === 'vnd') return (
          <div key={i} style={{ padding: 16, borderRadius: 18, border: '2px solid var(--line)', borderBottomWidth: 5, background: 'var(--surface)' }}>
            <span style={{ color: 'var(--brand)' }}><Ic n={icn} s={18} /></span>
            <b style={{ display: 'block', marginTop: 6, fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{v}</b>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{l}</span>
          </div>
        )
        if (k === 'meq') return (
          <div key={i} style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 1px 2px rgba(16,30,54,.06)' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{l}<span style={{ color: 'var(--brand2)' }}><Ic n={icn} s={15} /></span></span>
            <b style={{ display: 'block', marginTop: 4, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{v}</b>
          </div>
        )
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <span style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n={icn} s={18} /></span>
            <div style={{ lineHeight: 1.2 }}><b style={{ display: 'block', fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{v}</b><span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l}</span></div>
          </div>
        )
      })}
    </div>
  )
}

export function PlanProgress({ k, st }: { k: BrandKey; st: CronogramaState }) {
  return (
    <Card k={k} pad="16px 18px">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <b style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{st.totalDone}</b>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>de {PLAN_TOTAL_GOALS} metas concluídas</span>
        <b style={{ fontSize: 13, color: k === 'meq' ? 'var(--brand2)' : 'var(--brand)' }}>{fmtPct(st.pct)}</b>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Semana {PLAN_CURRENT_WEEK} de {PLAN_WEEKS} · {nbr(PLAN_TOTAL_GOALS - st.totalDone)} metas restantes</span>
      </div>
      <Bar k={k} pct={Math.max(st.pct, 0.6)} h={10} />
    </Card>
  )
}

// ── Toggle de visualização ───────────────────────────────────────────────────
export function ViewToggle({ k, mobile, st }: Shared) {
  const hk = k === 'meq' ? 'var(--head)' : 'var(--ink)'
  const rr = k === 'meq' ? 8 : 10
  const btn = (o: Pv, icn: IconName, t: string) => {
    const on = st.pv === o
    return (
      <button type="button" onClick={() => st.setPv(o)} style={{ position: 'relative', zIndex: 1, flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 36, padding: '0 14px', border: 0, background: 'transparent', color: on ? 'var(--tOnInk)' : 'var(--sub)', font: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color .3s' }}><Ic n={icn} s={15} />{t}</button>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <b style={{ fontSize: 16, color: hk }}>Visualização</b>
      <div style={{ position: 'relative', display: 'inline-flex', width: mobile ? '100%' : 340, padding: 4, borderRadius: k === 'meq' ? 11 : 14, background: 'var(--tBg)' }}>
        <span aria-hidden style={{ position: 'absolute', left: 4, top: 4, bottom: 4, width: 'calc(50% - 4px)', borderRadius: rr, background: 'var(--tOn)', boxShadow: '0 2px 8px rgba(0,0,0,.12)', transform: `translateX(${st.pv === 'lista' ? '100%' : '0%'})`, transition: 'transform .38s cubic-bezier(.22,1,.36,1)' }} />
        {btn('grade', 'grid', 'Grade semanal')}{btn('lista', 'list', 'Lista de metas')}
      </div>
      <span style={{ fontSize: 12, color: k === 'meq' ? 'var(--sub)' : 'var(--muted)' }}>Alterne quando quiser: o que você marca numa visão aparece na outra.</span>
    </div>
  )
}

// ── GRADE SEMANAL ────────────────────────────────────────────────────────────
function GridCell({ k, week, row, day, kind, st }: { k: BrandKey; week: number; row: number; day: number; kind: GoalType; st: CronogramaState }) {
  const key = cellKey(week, row, day)
  const mk = isMarkable(week, row)
  const c = gridCellContent(week, row, day)
  const content = (
    <>
      {c.aula && <><span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.04em', opacity: 0.75 }}>AULA {String(week).padStart(2, '0')}</span><b style={{ display: 'block', marginTop: 2, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.02em' }}>{c.aula.subject}</b><span style={{ display: 'block', marginTop: 3, fontSize: 12, lineHeight: 1.35 }}>{c.aula.topic}</span></>}
      {c.dash && <span style={{ opacity: 0.45, fontSize: 16 }}>—</span>}
      {c.text && <span style={{ fontSize: 12, lineHeight: 1.35, whiteSpace: 'pre-line' }}>{c.text}</span>}
      {c.leg && <><b style={{ display: 'block', fontSize: 12 }}>{c.leg.a}</b><span style={{ fontSize: 12 }}>{c.leg.b}</span></>}
    </>
  )
  const bd = { rev: '#6E5BB8', vnd: 'rgba(11,74,46,.35)', meq: 'rgba(48,106,181,.35)' }[k]
  if (!mk) {
    return <td style={{ padding: '12px 10px', background: 'var(--gCell)', color: 'var(--gInk)', border: `1px solid ${bd}`, textAlign: 'center', verticalAlign: 'middle', height: 64 }}>{content}</td>
  }
  const done = st.isDone(key)
  return (
    <td className="gcell" role="button" aria-label="Marcar meta" onClick={() => st.toggleCell(key)}
      style={{ position: 'relative', padding: '14px 12px 12px', background: done ? 'var(--gDone)' : 'var(--gCell)', color: 'var(--gInk)', border: `1px solid ${bd}`, textAlign: 'center', verticalAlign: 'middle', height: kind === 'aula' ? 104 : 64, cursor: 'pointer' }}>
      <span style={{ position: 'absolute', right: 6, top: 6, width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {done
          ? <span className="gpop" style={{ width: 20, height: 20, borderRadius: '50%', background: '#22B573', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="check" s={12} sw={3.2} /></span>
          : <span className="gempty" style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid currentColor', opacity: 0.35 }} />}
      </span>
      <div style={{ opacity: done ? (st.hd ? 0.28 : 0.62) : 1, textDecoration: done ? 'line-through' : 'none', transition: 'opacity .25s' }}>{content}</div>
    </td>
  )
}

export function GridTable({ k, mobile, st, week }: Shared & { week: number }) {
  const i = week - 1
  const headBg = { rev: 'linear-gradient(180deg,#2E2366,#3B2F7A)', vnd: 'linear-gradient(180deg,#0B4A2E,#12643D)', meq: 'linear-gradient(120deg,#171E3B,#25356F)' }[k]
  const headInk = { rev: '#F1C232', vnd: '#F1D48A', meq: '#5ECEF0' }[k]
  const subBg = { rev: '#7B66C9', vnd: '#2E8A5A', meq: '#306AB5' }[k]
  const colBg = { rev: '#F1C232', vnd: 'linear-gradient(180deg,#F1D48A,#D8B45A)', meq: '#3E7FE0' }[k]
  const colInk = { rev: '#2E1F7A', vnd: '#2A1F02', meq: '#FFFFFF' }[k]
  const labBg = { rev: '#4B3A8C', vnd: '#0E5434', meq: '#25356F' }[k]
  const labInk = { rev: '#FFFFFF', vnd: '#F1D48A', meq: '#DCEBFF' }[k]
  const bd = { rev: '#6E5BB8', vnd: 'rgba(11,74,46,.35)', meq: 'rgba(48,106,181,.35)' }[k]
  const r = { rev: 18, vnd: 22, meq: 10 }[k]
  const subTxt = { rev: 'REVISÃO', vnd: 'VND', meq: 'MEQ' }[k] + ' – CRONOGRAMA PGE/PGM COMPLETO · 2H'
  const nav = (fn: () => void, disabled: boolean, path: string, lab: string) => (
    <button type="button" onClick={fn} aria-label={lab} style={{ width: 38, height: 38, borderRadius: k === 'meq' ? 10 : '50%', border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.1)', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: disabled ? 0.35 : 1 }}>
      <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
    </button>
  )
  const stickyTh: CSSProperties = mobile ? { position: 'sticky', left: 0, zIndex: 2 } : {}
  return (
    <div style={{ borderRadius: r, overflow: 'hidden', border: `1px solid ${bd}`, background: 'var(--surface)', ...(k === 'vnd' ? { boxShadow: '0 5px 0 var(--line)' } : null) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: mobile ? 14 : '18px 22px', background: headBg, color: headInk }}>
        {nav(st.gwPrev, st.gw === 1, 'M15 6l-6 6 6 6', 'Semana anterior')}
        <div style={{ flex: 1, textAlign: 'center', lineHeight: 1.1 }}>
          <b style={{ display: 'block', fontSize: mobile ? 22 : 30, fontWeight: 800, letterSpacing: '.02em' }}>SEMANA {week}</b>
          <b style={{ display: 'block', marginTop: 4, fontSize: mobile ? 16 : 22, fontWeight: 800 }}>{G_RANGE[i]}</b>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 260, margin: '10px auto 0' }}>
            <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(255,255,255,.18)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.round((st.weekDone(week) / st.weekTotal(week)) * 100)}%`, borderRadius: 99, background: '#22B573', transition: 'width .4s cubic-bezier(.22,1,.36,1)' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF' }}>{st.weekDone(week)}/{st.weekTotal(week)}</span>
          </div>
        </div>
        {nav(st.gwNext, st.gw === 6, 'M9 6l6 6-6 6', 'Próxima semana')}
      </div>
      <div style={{ padding: '8px 12px', background: subBg, color: '#FFFFFF', textAlign: 'center', fontSize: mobile ? 11 : 12.5, fontWeight: 800, letterSpacing: '.08em' }}>{subTxt}</div>
      <div className="hs" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: mobile ? 1000 : 0, borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
          <thead><tr>
            <th style={{ padding: '10px 8px', background: labBg, color: labInk, fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', border: `1px solid ${bd}`, width: mobile ? 104 : 130, ...stickyTh }}>Carga horária sugerida</th>
            {G_DAYS.map((d) => <th key={d} style={{ padding: '10px 8px', background: colBg, color: colInk, fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', border: `1px solid ${bd}` }}>{d}</th>)}
          </tr></thead>
          <tbody>
            {G_ROWS.map((rw, ri) => (
              <tr key={ri} style={{ display: st.gridRows[ri] ? 'table-row' : 'none' }}>
                <th style={{ padding: '12px 8px', background: labBg, color: labInk, border: `1px solid ${bd}`, textAlign: 'center', verticalAlign: 'middle', ...stickyTh }}>
                  <b style={{ display: 'block', fontSize: 12.5 }}>{rw.hrs}</b>
                  <span style={{ display: 'block', marginTop: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', opacity: 0.85 }}>{rw.label}</span>
                </th>
                {G_DAYS.map((_, d) => <GridCell key={d} k={k} week={week} row={ri} day={d} kind={rw.type} st={st} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mobile && <div style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--muted)', background: 'var(--surface)', textAlign: 'center' }}>Deslize para ver todos os dias →</div>}
    </div>
  )
}

export function GridTools({ k, mobile, st }: Shared) {
  const sk = k === 'meq' ? 'var(--sub)' : 'var(--muted)'
  const r = k === 'meq' ? 8 : 99
  const lab = (t: string) => <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: sk, whiteSpace: 'nowrap' }}>{t}</span>
  const ibtn = (fn: () => void, icn: IconName, t: string) => (
    <button type="button" onClick={fn} className="ibtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: ctrlR(k, 10), border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}><Ic n={icn} s={14} />{t}</button>
  )
  const rowChips: Array<[IconName, string]> = [['book', 'Aulas'], ['layers', 'Flashcards'], ['clip', 'Questões'], ['books', 'Legproc']]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: ctrlR(k), background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {lab('Semana')}
        <div className="hs" style={{ display: 'flex', gap: 6, overflowX: 'auto', width: mobile ? '100%' : undefined }}>
          {[1, 2, 3, 4, 5, 6].map((w) => {
            const on = st.gw === w
            return (
              <button key={w} type="button" onClick={() => st.setGw(w)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: r, border: '1px solid var(--line)', background: on ? 'var(--chip)' : 'var(--surface)', color: on ? (k === 'meq' ? 'var(--brand2)' : 'var(--brand)') : 'var(--ink)', font: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>S{w}<span style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.75 }}>{st.weekDone(w)}/{st.weekTotal(w)}</span></button>
            )
          })}
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ibtn(() => st.markWeek(st.gw), 'check', 'Marcar semana')}
          {ibtn(() => st.clearWeek(st.gw), 'cal', 'Limpar semana')}
          <span className="ibtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer' }}><Ic n="dl" s={14} />Imprimir semana</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--line)' }}>
        {lab('Mostrar')}
        <div className="hs" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          {rowChips.map(([icn, t], i) => {
            const on = st.gridRows[i]
            return <button key={i} type="button" onClick={() => st.toggleGridRow(i)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: r, border: '1px solid var(--line)', background: on ? 'var(--fOn)' : 'transparent', color: on ? 'var(--fOnInk)' : sk, font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}><Ic n={icn} s={13} />{t}</button>
          })}
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: sk, whiteSpace: 'nowrap' }}><Switch on={st.hd} onToggle={() => st.setHd(!st.hd)} />Esmaecer concluídas</span>
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Toque em uma célula para marcar a meta como concluída. O progresso do plano atualiza na hora.</span>
    </div>
  )
}

export function GridView({ k, mobile, st }: Shared) {
  const lk = k === 'meq' ? 'var(--sub)' : 'var(--muted)', hk = k === 'meq' ? 'var(--head)' : 'var(--ink)'
  return (
    <div className="vgin" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <GridTools k={k} mobile={mobile} st={st} />
      <div className="gwin" key={st.gw}><GridTable k={k} mobile={mobile} st={st} week={st.gw} /></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: lk }}>
        {G_ROWS.map((rw, i) => <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><b style={{ color: hk }}>{rw.hrs}</b>{rw.label}</span>)}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 16, borderRadius: '50%', background: '#22B573', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="check" s={10} sw={3.2} /></span>meta concluída</span>
      </div>
    </div>
  )
}

// ── LISTA DE METAS ───────────────────────────────────────────────────────────
function PlanRow({ k, mobile, st, item }: Shared & { item: { key: string; day: string; type: GoalType; title: string; dur: string } }) {
  const done = st.isDone(item.key)
  const box = (
    <button type="button" onClick={() => st.toggleCell(item.key)} aria-label="Concluir meta" style={{ width: 24, height: 24, flexShrink: 0, padding: 0, borderRadius: k === 'vnd' ? 8 : 6, border: `2px solid ${done ? 'var(--ckOn)' : 'var(--line2)'}`, background: done ? 'var(--ckOn)' : 'transparent', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background .2s' }}>
      {done && <span className="gpop" style={{ display: 'inline-flex' }}><Ic n="check" s={14} sw={3.2} /></span>}
    </button>
  )
  const doneTxt = done ? <span style={{ display: 'block', marginTop: 3, fontSize: 11.5, fontWeight: 600, color: '#1FA868' }}>Concluída</span> : null
  const titleSty: CSSProperties = { fontSize: mobile ? 13 : 13.5, fontWeight: 600, color: 'var(--ink)', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.55 : 1 }
  return (
    <div className="rowh" style={{ display: 'flex', alignItems: mobile ? 'flex-start' : 'center', gap: 12, padding: `12px ${mobile ? 12 : 16}px`, borderTop: '1px solid var(--line)' }}>
      {mobile ? (
        <>
          {box}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <b style={{ fontSize: 12, color: 'var(--muted)' }}>{item.day}</b>
              <TPill k={k} t={item.type} small />
              <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted)' }}>{item.dur}</span>
            </div>
            <span style={titleSty}>{item.title}</span>{doneTxt}
          </div>
        </>
      ) : (
        <>
          {box}
          <b style={{ width: 38, fontSize: 13, color: 'var(--ink)' }}>{item.day}</b>
          <span style={{ width: 104, flexShrink: 0 }}><TPill k={k} t={item.type} /></span>
          <div style={{ flex: 1, minWidth: 0 }}><span style={titleSty}>{item.title}</span>{doneTxt}</div>
          {k === 'vnd' && <span style={{ height: 22, padding: '0 8px', borderRadius: 99, background: 'var(--goldBg)', color: 'var(--goldInk)', fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>+5 XP</span>}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)', width: 84, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}><Ic n="clock" s={13} />{item.dur}</span>
          <span title="Anotação" style={{ color: 'var(--muted)', display: 'inline-flex' }}><Ic n="edit" s={14} /></span>
        </>
      )}
    </div>
  )
}

function WeekBlock({ k, mobile, st, week, range, total }: Shared & { week: number; range: string; total: number }) {
  const open = st.openWeeks[week] ?? false
  const items = listItems(week)
  const hb: CSSProperties = k === 'rev' ? { background: 'linear-gradient(90deg,#3B1E8F,#5B3FD0)', color: '#FFFFFF' }
    : k === 'vnd' ? { background: 'linear-gradient(90deg,#0B4A2E,#12643D)', color: '#FFFFFF' }
      : { background: 'var(--surface2)', color: 'var(--ink)' }
  const badge = k === 'rev'
    ? <span style={{ height: 22, padding: '0 9px', borderRadius: 99, background: 'rgba(255,255,255,.16)', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>{total} metas</span>
    : k === 'vnd'
      ? <span style={{ height: 24, padding: '0 10px', borderRadius: 99, background: 'linear-gradient(180deg,#F1D48A,#D8B45A)', color: '#2A1F02', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', boxShadow: '0 2px 0 #9A7414' }}>{total} metas · +{total * 5} XP</span>
      : <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>{total} metas</span>
  return (
    <div style={{ borderRadius: ctrlR(k, 14), overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--surface)' }}>
      <button type="button" onClick={() => st.toggleWeek(week)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 16px', border: 0, ...hb, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
        <span style={{ display: 'inline-flex', transform: `rotate(${open ? '0deg' : '-90deg'})`, transition: 'transform .2s' }}><Ic n="down" s={15} /></span>
        <b style={{ fontSize: 14 }}>Semana {week}</b>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{range}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, opacity: 0.85 }}>{st.weekDone(week)}/{st.weekTotal(week)} feitas</span>
        {badge}
      </button>
      {open && items.length > 0 && items
        .filter((it) => st.tf === 'all' || it.type === st.tf)
        .filter((it) => !(st.hd && st.isDone(it.key)))
        .map((it) => <PlanRow key={it.key} k={k} mobile={mobile} st={st} item={it} />)}
      {open && items.length === 0 && <div style={{ padding: '14px 16px', borderTop: '1px solid var(--line)', fontSize: 12.5, color: 'var(--muted)' }}>{total} metas programadas · abra quando a semana começar para ver a grade completa.</div>}
    </div>
  )
}

export function PlanFilters({ k, mobile, st }: Shared) {
  const hk = k === 'meq' ? 'var(--head)' : 'var(--ink)', sk = k === 'meq' ? 'var(--sub)' : 'var(--muted)'
  const r = k === 'meq' ? 8 : 99
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <b style={{ fontSize: 15, color: hk, marginRight: 6 }}>Seu plano semana a semana</b>
      {!mobile && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', borderRadius: ctrlR(k, 10), border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>Todas as semanas<Ic n="down" s={13} /></span>}
      <div className="hs" style={{ display: 'flex', gap: 6, overflowX: 'auto', width: mobile ? '100%' : undefined }}>
        {(['all', 'aula', 'flash', 'q', 'lei'] as TfKey[]).map((o, i) => {
          const on = st.tf === o
          return <button key={o} type="button" onClick={() => st.setTf(o)} style={{ flexShrink: 0, height: 32, padding: '0 12px', borderRadius: r, border: '1px solid var(--line)', background: on ? 'var(--fOn)' : 'transparent', color: on ? 'var(--fOnInk)' : sk, font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{TF_LAB[i]}</button>
        })}
      </div>
      <span style={{ flex: 1 }} />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: sk, whiteSpace: 'nowrap' }}><Switch on={st.hd} onToggle={() => st.setHd(!st.hd)} />Ocultar concluídas</span>
      <button type="button" onClick={st.closeAllWeeks} style={{ border: 0, background: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700, color: hk, cursor: 'pointer', whiteSpace: 'nowrap' }}>Fechar todas</button>
    </div>
  )
}

export function PlanList({ k, mobile, st }: Shared) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PlanFilters k={k} mobile={mobile} st={st} />
      {WK.map((w) => <WeekBlock key={w.n} k={k} mobile={mobile} st={st} week={w.n} range={w.range} total={w.total} />)}
    </div>
  )
}

// ── Lateral da lista (hoje / tipos / dica) ───────────────────────────────────
export function TodayCard({ k }: { k: BrandKey }) {
  if (k === 'rev') {
    return (
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, padding: 20, background: 'radial-gradient(120% 120% at 100% 0%,#6449E0 0%,#3B1E8F 55%,#1E1150 100%)', color: '#FFFFFF' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', color: '#F1C232' }}>META DE HOJE · QUA</span>
        <b style={{ display: 'block', marginTop: 8, fontSize: 17, lineHeight: 1.3 }}>Direito Administrativo: Aula 01 – Introdução ao Direito Administrativo</b>
        <span style={{ display: 'block', marginTop: 6, fontSize: 12.5, color: '#CFC4FF' }}>PDF · 1h30 · próxima: videoaula 01 amanhã</span>
        <span className="gobtn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, height: 46, borderRadius: 13, background: '#F1C232', color: '#2A1A55', fontSize: 14.5, fontWeight: 800, cursor: 'pointer' }}><Ic n="play" s={14} />Abrir material</span>
      </div>
    )
  }
  if (k === 'vnd') {
    return (
      <Card k={k} pad={18}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
            <svg viewBox="0 0 64 64" style={{ width: 64, height: 64, transform: 'rotate(-90deg)' }}>
              <circle cx={32} cy={32} r={26} fill="none" stroke="var(--track)" strokeWidth={8} />
              <circle cx={32} cy={32} r={26} fill="none" stroke="#E8C877" strokeWidth={8} strokeLinecap="round" strokeDasharray={163.4} strokeDashoffset={108.9} />
            </svg>
            <b style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--ink)' }}>2/6</b>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.18em', color: 'var(--goldInk)' }}>META DA SEMANA</span>
            <b style={{ display: 'block', fontSize: 16, color: 'var(--ink)' }}>Faltam 4 metas · +20 XP</b>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Complete a semana para ganhar o baú.</span>
          </div>
        </div>
        <div style={{ marginTop: 14, padding: 12, borderRadius: 14, background: 'var(--surface2)' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)' }}>HOJE · QUA</span>
          <b style={{ display: 'block', marginTop: 4, fontSize: 13.5, color: 'var(--ink)' }}>Direito Administrativo: Aula 01</b>
        </div>
        <span className="gobtn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, height: 48, borderRadius: 14, background: 'linear-gradient(180deg,#F1D48A,#D8B45A)', color: '#2A1F02', fontSize: 15, fontWeight: 800, boxShadow: '0 4px 0 #9A7414', cursor: 'pointer' }}><Ic n="play" s={14} />Estudar agora</span>
      </Card>
    )
  }
  return (
    <Card k={k} pad={16}>
      <Head k={k} icon="target" title="Hoje · quarta-feira" />
      <b style={{ display: 'block', fontSize: 14, color: 'var(--ink)' }}>Direito Administrativo: Aula 01 – Introdução</b>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>PDF · 1h30 · semana 1</span>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <span style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 42, borderRadius: 10, background: 'var(--brand)', color: '#FFFFFF', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}><Ic n="play" s={13} />Abrir material</span>
        <span className="ibtn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 10, border: '1px solid var(--line)', color: 'var(--muted)', cursor: 'pointer' }}><Ic n="check" s={15} /></span>
      </div>
    </Card>
  )
}

export function LegendTypes({ k }: { k: BrandKey }) {
  return (
    <Card k={k} pad={16}>
      <Cap>Tipos de meta</Cap>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {(['aula', 'flash', 'q', 'lei'] as GoalType[]).map((t) => <TPill key={t} k={k} t={t} />)}
      </div>
    </Card>
  )
}

// ── Diferenciais exclusivos (VND trilha / MEQ gantt) ─────────────────────────
export function VndTrail({ k, mobile }: { k: BrandKey; mobile: boolean }) {
  const items: ReactNode[] = []
  const last = mobile ? 7 : 12
  for (let w = 1; w <= last; w++) {
    const stt = w < 5 ? 'done' : w === 5 ? 'cur' : 'lock'
    let s: CSSProperties; let inner: ReactNode
    if (stt === 'done') { s = { background: 'linear-gradient(180deg,#2BB673,#16804F)', color: '#FFFFFF', boxShadow: '0 4px 0 #0B4A2E' }; inner = <Ic n="check" s={18} sw={3} /> }
    else if (stt === 'cur') { s = { background: 'linear-gradient(180deg,#F1D48A,#D8B45A)', color: '#2A1F02', boxShadow: '0 4px 0 #9A7414', transform: 'scale(1.12)' }; inner = <b style={{ fontSize: 15 }}>{w}</b> }
    else { s = { background: 'var(--surface2)', color: 'var(--muted)', boxShadow: '0 4px 0 var(--line2)' }; inner = <b style={{ fontSize: 14 }}>{w}</b> }
    items.push(
      <div key={`w${w}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ width: 46, height: 46, borderRadius: '50%', ...s, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{inner}</span>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)' }}>SEM {w}</span>
      </div>,
    )
    if (w % 4 === 0) items.push(
      <span key={`g${w}`} style={{ width: 40, height: 40, marginTop: 3, borderRadius: 12, background: w < 5 ? 'var(--goldBg)' : 'var(--surface2)', color: w < 5 ? 'var(--goldInk)' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="gift" s={18} /></span>,
    )
  }
  return (
    <Card k={k} pad={18}>
      <Head k={k} icon="flag" title="Trilha de semanas" right={<span style={{ fontSize: 12, fontWeight: 700, color: 'var(--goldInk)' }}>4 semanas concluídas · 2 baús</span>} />
      <div className="hs" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, overflowX: 'auto', padding: '6px 2px 4px' }}>{items}</div>
    </Card>
  )
}

export function Gantt({ k }: { k: BrandKey }) {
  return (
    <Card k={k} pad={18}>
      <Head k={k} icon="chart" title="Linha do tempo das matérias" right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--muted)' }}><span style={{ width: 10, height: 2, background: '#E5484D' }} />você está na semana 5</span>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {GANTT.map((g) => (
          <div key={g.name} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr)', gap: 10, alignItems: 'center', height: 26 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
            <div style={{ position: 'relative', height: 10, borderRadius: 3, background: 'var(--surface2)' }}>
              {g.segments.map(([a, w], i) => <span key={i} style={{ position: 'absolute', left: `${(a / 89) * 100}%`, width: `${Math.max((w / 89) * 100, 0.9)}%`, top: 0, bottom: 0, borderRadius: 3, background: g.color }} />)}
              <span style={{ position: 'absolute', left: `${(5 / 89) * 100}%`, top: -6, bottom: -6, width: 2, background: '#E5484D' }} />
            </div>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr)', gap: 10 }}>
          <span />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--muted)' }}>{GANTT_AXIS.map((w) => <span key={w}>S{w}</span>)}</div>
        </div>
      </div>
    </Card>
  )
}

