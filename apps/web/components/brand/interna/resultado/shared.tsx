'use client'

// Blocos COMPARTILHADOS do resultado interno (spec 05 §2.2–2.4): átomos estilizados por marca via
// tokens. Cada marca (resultado-*.tsx) monta Visão geral / Questões / Ranking / Avaliação combinando
// estes átomos. Todos os blocos do mockup estão aqui — os que têm fonte real (`ResultadoInternoData`
// obrigatório) são vinculados; os que ainda não têm (turma/ranking/tempo/dificuldade/padrão) usam os
// campos OPCIONAIS alimentados por valores de EXEMPLO no mock.ts (fidelidade visual é prioridade).
//
// Regras do handoff: nada de <text> em <svg preserveAspectRatio="none">; rótulos/valores dos gráficos
// em HTML. Outros alunos SÓ por iniciais (privacidade §2.4). Downloads em dois grupos com tile+ícone.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowRight,
  BarChart3,
  Bookmark,
  BookOpen,
  Check,
  ChevronDown,
  Clock,
  Crown,
  Download,
  Flag,
  GraduationCap,
  Info,
  Layers,
  Lightbulb,
  Lock,
  type LucideIcon,
  Medal,
  MessageSquare,
  Minus,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  User,
  Users,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Brand } from '../interna-tokens'
import type {
  ResCorrecao,
  ResDownload,
  ResRankPeer,
  ResStatus,
  ResTentativa,
  ResultadoInternoData,
} from './data'
import { fnum, notec, posFmt, stc } from './mock'

type QStatus = ResStatus

export const acc = (brand: Brand) => (brand === 'meq' ? 'var(--brand2)' : 'var(--brand)')
const RADIUS = { revisao: 20, vnd: 24, meq: 14 } as const

const OK = '#1FA868'
const WARN = '#D99A1E'
const ERR = '#E5484D'

/** `true` abaixo de 920px (layout mobile das composições). SSR-safe (começa desktop). */
export function useIsMobile(bp = 920): boolean {
  const [m, setM] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${bp}px)`)
    const on = () => setM(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [bp])
  return m
}

/** CSS compartilhado (fade da aba + hovers + barra + recálculo). Prefixo da marca para escopo. */
export function resultadoCss(p: string): string {
  return `
.${p} .rrz-pv{animation:${p}pv .45s cubic-bezier(.22,1,.36,1) both}
@keyframes ${p}pv{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.${p} .rrz-bar{transform-origin:0 50%;animation:${p}bar 1.1s cubic-bezier(.22,1,.36,1) .3s both}
@keyframes ${p}bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.${p} .rrz-grow{transform-origin:50% 100%;animation:${p}grow .9s cubic-bezier(.2,.8,.2,1) both}
@keyframes ${p}grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.${p} .rrz-rowh{transition:background .2s}
.${p} .rrz-rowh:hover{background:var(--surface2)}
.${p} .rrz-ibtn{transition:background .18s,border-color .18s,color .18s}
.${p} .rrz-ibtn:hover{background:var(--surface2)}
.${p} .rrz-dlc{transition:background .18s,color .18s,border-color .18s,transform .18s,box-shadow .18s}
.${p} .rrz-dlc:hover{background:var(--cbOn);border-color:var(--cbOn);color:#fff;transform:translateY(-1px);box-shadow:0 6px 14px -8px var(--cbOn)}
.${p} .rrz-dlc:active{transform:translateY(0)}
.${p} .rrz-hs{scrollbar-width:none}.${p} .rrz-hs::-webkit-scrollbar{display:none}
.${p} .rrz-lift{transition:transform .35s,box-shadow .35s,border-color .35s}
.${p} .rrz-lift:hover{transform:translateY(-3px);box-shadow:0 18px 30px -22px rgba(20,16,60,.5)}
@media (prefers-reduced-motion:reduce){.${p} *{animation:none!important}.${p} .rrz-bar,.${p} .rrz-grow{transform:none!important}}
`
}

/** Legenda CAPS 10.5px. */
export function Capt({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: color ?? 'var(--muted)' }}>
      {children}
    </span>
  )
}

/** Card base — raio e sombra por marca (sombra só MEQ). */
export function Card({
  brand,
  children,
  pad = '18px',
  className,
  style,
}: {
  brand: Brand
  children: ReactNode
  pad?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={cn('rrz-card', className)}
      style={{
        padding: pad,
        borderRadius: RADIUS[brand],
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        boxShadow: brand === 'meq' ? '0 1px 2px rgba(16,30,70,.06),0 8px 24px -16px rgba(16,30,70,.25)' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Cabeçalho de card — ícone+título+subtítulo + slot à direita. Marca varia o ícone. */
export function Head({
  brand,
  icon: Icon,
  title,
  sub,
  right,
}: {
  brand: Brand
  icon: LucideIcon
  title: string
  sub?: string
  right?: ReactNode
}) {
  const iconbox =
    brand === 'vnd' ? (
      <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--chip)', color: acc(brand), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={17} />
      </span>
    ) : brand === 'meq' ? (
      <span aria-hidden style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 16 }}>
        {[7, 11, 15].map((h, i) => (
          <span key={i} style={{ width: 3, height: h, borderRadius: 1, background: acc(brand), opacity: 0.55 + i * 0.22 }} />
        ))}
      </span>
    ) : (
      <Icon size={18} style={{ color: acc(brand) }} />
    )
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {iconbox}
        <div style={{ minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 15, letterSpacing: '-0.01em', color: 'var(--ink)' }}>{title}</b>
          {sub ? <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{sub}</span> : null}
        </div>
      </div>
      {right ? <div style={{ flexShrink: 0 }}>{right}</div> : null}
    </div>
  )
}

/** Botão genérico (ghost/accent/primary). `href` → vira link real; senão `<button>` inerte visual. */
export function Btn({
  brand,
  icon: Icon,
  children,
  kind = 'ghost',
  h = 36,
  href,
}: {
  brand: Brand
  icon?: LucideIcon
  children: ReactNode
  kind?: 'ghost' | 'accent' | 'primary'
  h?: number
  href?: string | null
}) {
  const r = brand === 'meq' ? 10 : brand === 'vnd' ? 12 : 11
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    height: h,
    padding: '0 14px',
    borderRadius: r,
    font: 'inherit',
    fontSize: 12.5,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    border: '1px solid var(--line)',
    background: 'transparent',
    color: 'var(--ink)',
    textDecoration: 'none',
  }
  if (kind === 'accent') {
    base.background = brand === 'vnd' ? 'var(--flag)' : acc(brand)
    base.color = brand === 'vnd' ? '#2A1F02' : '#FFFFFF'
    base.border = '0'
  } else if (kind === 'primary') {
    base.background = acc(brand)
    base.color = '#FFFFFF'
    base.border = '0'
  }
  const inner = (
    <>
      {Icon ? <Icon size={14} /> : null}
      {children}
    </>
  )
  if (href) {
    return (
      <a href={href} style={base}>
        {inner}
      </a>
    )
  }
  return (
    <span aria-hidden style={{ ...base, opacity: 0.55, cursor: 'default' }}>
      {inner}
    </span>
  )
}

// ───────────────────────────── mapa / donut ─────────────────────────────────

function Qcell({ brand, ordem, st, h = 24 }: { brand: Brand; ordem: number; st: QStatus; h?: number }) {
  const { c, bg, lab } = stc(st)
  let sty: CSSProperties
  if (brand === 'vnd') sty = { borderRadius: '50%', background: c, color: '#FFFFFF', width: h, justifySelf: 'center' }
  else if (brand === 'meq') sty = { borderRadius: 4, background: bg, color: c, boxShadow: `inset 0 -2px 0 ${c}` }
  else sty = { borderRadius: 6, background: bg, color: c, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 40%, transparent)` }
  return (
    <span
      title={`Questão ${ordem} · ${lab}`}
      style={{ height: h, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, ...sty }}
    >
      {ordem}
    </span>
  )
}

/** Mapa de questões (coloridas por status) a partir de `data.mapa`. */
export function Qmap({ brand, data, cols = 10, h = 24, legend = true }: { brand: Brand; data: ResultadoInternoData; cols?: number; h?: number; legend?: boolean }) {
  const counts = useMemo(() => {
    const c = { certa: 0, errada: 0, branco: 0, anulada: 0 }
    for (const m of data.mapa) c[m.status]++
    return c
  }, [data.mapa])
  const temAnulada = counts.anulada > 0
  const legendKeys = (temAnulada ? ['certa', 'errada', 'branco', 'anulada'] : ['certa', 'errada', 'branco']) as QStatus[]
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 3 }}>
        {data.mapa.map((m) => (
          <Qcell key={m.ordem} brand={brand} ordem={m.ordem} st={m.status} h={h} />
        ))}
      </div>
      {legend ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, fontSize: 11.5, color: 'var(--muted)' }}>
          {legendKeys.map((s) => (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: stc(s).c }} />
              {stc(s).lab} <b style={{ color: 'var(--ink)' }}>{counts[s]}</b>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Donut de acertos/erros/branco a partir de `data.melhor`. */
export function DonutBlock({ data, size = 110 }: { data: ResultadoInternoData; size?: number }) {
  const m = data.melhor
  const n = Math.max(m.total, 1)
  const parts: [number, string][] = [
    [m.acertos / n, OK],
    [m.erros / n, ERR],
    [Math.max(m.branco, 0.0001) / n, 'var(--line2)'],
  ]
  const R = size / 2
  const sw = 14
  const rad = R - sw / 2
  const circ = 2 * Math.PI * rad
  let off = 0
  const legend: [QStatus, number][] = [['certa', m.acertos], ['errada', m.erros], ['branco', m.branco]]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, transform: 'rotate(-90deg)' }} aria-hidden>
          <circle cx={R} cy={R} r={rad} fill="none" stroke="var(--track)" strokeWidth={sw} />
          {parts.map(([pp, c], i) => {
            const len = pp * circ
            const el = (
              <circle key={i} cx={R} cy={R} r={rad} fill="none" stroke={c} strokeWidth={sw} strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-off} strokeLinecap="butt" />
            )
            off += len
            return el
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <b style={{ fontSize: 20, color: 'var(--ink)' }}>
            {m.acertos}/{m.total}
          </b>
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>acertos</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {legend.map(([s, v]) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: stc(s).c }} />
            <span style={{ color: 'var(--muted)', width: 74 }}>{stc(s).lab}</span>
            <b style={{ color: 'var(--ink)' }}>{v}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

// ───────────────────────────── barra com traço da turma ─────────────────────

/** Barra de % do aluno com marcador (traço) da turma — usada em disciplina/dificuldade. */
function BarTurma({ pct, color, turma, h = 10 }: { pct: number; color: string; turma?: number; h?: number }) {
  return (
    <div style={{ position: 'relative', height: h, borderRadius: 99, background: 'var(--track)' }}>
      <span className="rrz-bar" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(pct, 2)}%`, borderRadius: 99, background: color }} />
      {typeof turma === 'number' ? (
        <span title={`Turma ${turma}%`} style={{ position: 'absolute', top: -4, bottom: -4, left: `${turma}%`, width: 3, borderRadius: 2, background: 'var(--ink)', opacity: 0.55 }} />
      ) : null}
    </div>
  )
}

// ───────────────────────────── disciplina ───────────────────────────────────

/** Barras de acerto por disciplina — com traço da turma (spec §2.2). */
export function DiscBars({ data }: { data: ResultadoInternoData }) {
  if (!data.porDisciplina.length) {
    return <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Sem dados por disciplina.</span>
  }
  return (
    <div>
      {data.porDisciplina.map((di) => (
        <div key={di.nome} style={{ padding: '9px 0', borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 7 }}>
            <b style={{ fontSize: 13, color: 'var(--ink)' }}>{di.nome}</b>
            <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              {di.ac}/{di.tt} · <b style={{ color: notec(di.pct)[0] }}>{di.pct}%</b>
            </span>
          </div>
          <BarTurma pct={di.pct} color={notec(di.pct)[0]} turma={di.turmaPct} />
        </div>
      ))}
      {data.porDisciplina.some((d) => typeof d.turmaPct === 'number') ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11.5, color: 'var(--muted)' }}>
          <span style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--ink)', opacity: 0.55 }} /> Média da turma
        </div>
      ) : null}
    </div>
  )
}

/** Acerto por dificuldade — Fácil/Média/Difícil com traço da turma. */
export function DificuldadeBlock({ data }: { data: ResultadoInternoData }) {
  const difs = data.dificuldade ?? []
  const rot: Record<string, [string, string]> = { facil: ['Fácil', OK], media: ['Média', WARN], dificil: ['Difícil', ERR] }
  if (!difs.length) return <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Sem dados.</span>
  return (
    <div>
      {difs.map((di) => {
        const [lab, dot] = rot[di.nivel]
        return (
          <div key={di.nivel} style={{ display: 'grid', gridTemplateColumns: '74px 1fr 92px', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
              {lab}
            </span>
            <BarTurma pct={di.pct} color={notec(di.pct)[0]} turma={di.turmaPct} h={12} />
            <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              <b style={{ color: notec(di.pct)[0] }}>{di.pct}%</b> · {di.qtd} q.
            </span>
          </div>
        )
      })}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11.5, color: 'var(--muted)' }}>
        <span style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--ink)', opacity: 0.55 }} /> Traço = média da turma
      </div>
    </div>
  )
}

/** Seu padrão de respostas — barra C/E/branco + 3 tiles + dica. */
export function PadraoBlock({ brand, data }: { brand: Brand; data: ResultadoInternoData }) {
  const p = data.padrao
  if (!p) return <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Sem dados.</span>
  const segs: [string, number, string][] = [
    ['Marcou C', p.marcouCpct, OK],
    ['Marcou E', p.marcouEpct, ERR],
    ['Branco', p.brancoPct, 'var(--line2)'],
  ]
  const tiles: [string, number][] = [
    ['Acerto quando marca C', p.acertoQuandoC],
    ['Acerto quando marca E', p.acertoQuandoE],
    ['Questões em branco', p.brancoPct],
  ]
  return (
    <div>
      <div style={{ display: 'flex', height: 14, borderRadius: 99, overflow: 'hidden', background: 'var(--track)' }}>
        {segs.map(([lab, v, c]) => (
          <span key={lab} className="rrz-bar" title={`${lab} ${v}%`} style={{ width: `${v}%`, background: c }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '8px 0 14px', fontSize: 11.5, color: 'var(--muted)' }}>
        {segs.map(([lab, v, c]) => (
          <span key={lab} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: c }} />
            {lab} <b style={{ color: 'var(--ink)' }}>{v}%</b>
          </span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {tiles.map(([lab, v], i) => (
          <div key={i} style={{ padding: '10px 12px', borderRadius: brand === 'meq' ? 10 : 14, background: 'var(--surface2)', border: '1px solid var(--line)' }}>
            <b style={{ display: 'block', fontSize: 18, color: 'var(--ink)' }}>{v}%</b>
            <span style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.3 }}>{lab}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: brand === 'meq' ? 10 : 14, background: 'var(--chip)', color: acc(brand), fontSize: 12, lineHeight: 1.5 }}>
        <Lightbulb size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{p.dica}</span>
      </div>
    </div>
  )
}

/** Tempo por questão — barras finas coloridas + linha da média + separadores por disciplina. */
export function TempoPorQuestao({ data }: { data: ResultadoInternoData }) {
  const arr = data.tempoPorQuestao ?? []
  if (!arr.length) return <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Sem dados.</span>
  const max = Math.max(...arr.map((q) => q.seg), 1)
  const media = data.tempoMedia ?? Math.round(arr.reduce((s, q) => s + q.seg, 0) / arr.length)
  const mediaPct = (media / max) * 100
  // separadores por disciplina (índice onde a disciplina muda)
  const discByOrdem = new Map(data.correcao.map((c) => [c.ordem, c.disciplina]))
  const total = arr.reduce((s, q) => s + q.seg, 0)
  const slow = [...arr].sort((a, b) => b.seg - a.seg)[0]
  const H = 90
  return (
    <div>
      <div style={{ position: 'relative', height: H, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: `${mediaPct}%`, height: 0, borderTop: '1.5px dashed color-mix(in srgb,var(--ink) 40%,transparent)', pointerEvents: 'none' }} />
        {arr.map((q, i) => {
          const prevDisc = i > 0 ? discByOrdem.get(arr[i - 1].ordem) : null
          const sep = i > 0 && prevDisc !== discByOrdem.get(q.ordem)
          return (
            <span
              key={q.ordem}
              title={`Q${q.ordem} · ${Math.round(q.seg)}s`}
              className="rrz-grow"
              style={{
                flex: 1,
                minWidth: 0,
                height: `${(q.seg / max) * 100}%`,
                background: stc(q.status).c,
                borderRadius: '2px 2px 0 0',
                borderLeft: sep ? '1px dashed var(--line2)' : undefined,
                animationDelay: `${i * 0.01}s`,
              }}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, fontSize: 11.5, color: 'var(--muted)' }}>
        <span>Total <b style={{ color: 'var(--ink)' }}>{fmtSec(total)}</b></span>
        <span>Média <b style={{ color: 'var(--ink)' }}>{Math.round(media)}s</b></span>
        {slow ? <span>Mais demorada <b style={{ color: 'var(--ink)' }}>Q{slow.ordem}</b></span> : null}
      </div>
    </div>
  )
}

function fmtSec(sec: number): string {
  sec = Math.round(sec)
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`
  return `${Math.floor(sec / 60)}min`
}

// ───────────────────────────── stats tiles ──────────────────────────────────

/** Tiles de estatística do aluno (acertos/erros/branco/nota/tempo/posição) de `melhor`. */
export function StatTiles({ brand, data }: { brand: Brand; data: ResultadoInternoData }) {
  const m = data.melhor
  const notaTxt = data.notaLiberada && m.nota !== null ? fnum(m.nota) : '—'
  const tiles: [LucideIcon, string, string][] = [
    [Target, notaTxt, data.notaLiberada ? 'Nota' : 'Aguardando'],
    [Check, `${m.acertos}/${m.total}`, `Acertos · ${m.pct}%`],
    [Clock, m.tempo, 'Tempo total'],
    [Clock, m.tpq ?? '—', 'Por questão'],
    [Trophy, m.posicao !== null ? posFmt(m.posicao) : '—', m.participantes ? `de ${m.participantes.toLocaleString('pt-BR')}` : 'Posição'],
    [Zap, m.xp ? `+${m.xp}` : '—', 'XP ganho'],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
      {tiles.map(([Icon, v, l], i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px', borderRadius: brand === 'meq' ? 12 : 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
          <span style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--chip)', color: acc(brand), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={16} />
          </span>
          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 17, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{v}</b>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{l}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

/** 4 anéis (VND) — Acerto / Tempo por questão / Posição / XP. */
function RingStat({ pct, color, label, value, size = 76 }: { pct: number; color: string; label: string; value: string; size?: number }) {
  const sw = 8
  const r = (size - sw) / 2
  const circ = 2 * Math.PI * r
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, transform: 'rotate(-90deg)' }} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={sw} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${(Math.min(pct, 100) / 100) * circ} ${circ}`} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{value}</div>
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textAlign: 'center' }}>{label}</span>
    </div>
  )
}

export function RingStats({ data }: { data: ResultadoInternoData }) {
  const m = data.melhor
  const rings = [
    { pct: m.pct, color: notec(m.pct)[0], label: 'Acerto', value: `${m.pct}%` },
    { pct: Math.min(100, 100 - (m.posicao && m.participantes ? (m.posicao / m.participantes) * 100 : 50)), color: 'var(--brand)', label: 'Posição', value: m.posicao !== null ? posFmt(m.posicao) : '—' },
    { pct: m.percentil ?? 50, color: '#E8C877', label: 'Top da turma', value: `${m.percentil ?? '—'}%` },
    { pct: 100, color: notec(m.nota ?? 0)[0], label: 'XP ganho', value: m.xp ? `+${m.xp}` : '—' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 14 }}>
      {rings.map((r, i) => (
        <Card key={i} brand="vnd" pad="16px">
          <RingStat {...r} />
        </Card>
      ))}
    </div>
  )
}

// ───────────────────────────── downloads reais ──────────────────────────────

function DlTile({ brand, dl, compact }: { brand: Brand; dl: ResDownload; compact?: boolean }) {
  const r = brand === 'revisao' ? 14 : brand === 'vnd' ? 12 : 8
  const Icon = /comentad/i.test(dl.nome) ? MessageSquare : /diagn/i.test(dl.nome) ? BarChart3 : /caderno/i.test(dl.nome) ? BookOpen : Download
  return (
    <a
      href={dl.href}
      className="rrz-dlc"
      title={`Baixar ${dl.nome}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: compact ? 36 : 42,
        padding: compact ? '0 12px' : '0 14px',
        borderRadius: r,
        border: '1px solid var(--line)',
        background: 'var(--surface)',
        color: 'var(--ink)',
        fontSize: compact ? 12 : 12.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        textDecoration: 'none',
      }}
    >
      <span style={{ width: compact ? 22 : 26, height: compact ? 22 : 26, borderRadius: 7, background: 'var(--chip)', color: acc(brand), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={compact ? 13 : 14} />
      </span>
      {dl.nome}
      <ArrowRight size={13} style={{ opacity: 0.6, marginLeft: 2 }} />
    </a>
  )
}

/** Downloads em 2 grupos ("Como você fez" × "Com gabarito") a partir de `data.downloads` (§3.6). */
export function Downloads({ brand, data, compact = false }: { brand: Brand; data: ResultadoInternoData; compact?: boolean }) {
  const semGab = data.downloads.filter((d) => !d.comGab)
  const comGab = data.downloads.filter((d) => d.comGab)
  if (!data.downloads.length) return null
  const grp = (lab: string, items: ResDownload[]) =>
    items.length ? (
      <div style={{ minWidth: 0, flex: 1 }}>
        <Capt>{lab}</Capt>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {items.map((dl) => (
            <DlTile key={dl.href + dl.nome} brand={brand} dl={dl} compact={compact} />
          ))}
        </div>
      </div>
    ) : null
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
      {grp('Como você fez', semGab)}
      {grp('Com gabarito', comGab)}
    </div>
  )
}

// ───────────────────────────── nota em anel ─────────────────────────────────

function Vring({ nota, size = 40 }: { nota: number; size?: number }) {
  const sw = Math.max(4, size * 0.1)
  const r = (size - sw) / 2
  const circ = 2 * Math.PI * r
  const c = notec(nota)[0]
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${(nota / 100) * circ} ${circ}`} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.3, fontWeight: 800, color: 'var(--ink)' }}>
        {fnum(nota)}
      </div>
    </div>
  )
}

// ───────────────────────────── realizações (tentativas) ─────────────────────

const ACOL: Record<Brand, [string, string, string]> = {
  revisao: ['#C9BDF7', '#8F75FF', '#4B30BE'],
  vnd: ['#B7DEC6', '#46B97E', '#0F6B3C'],
  meq: ['#B9D1F5', '#5E9BFF', '#1F4E9A'],
}
const attColor = (k: number, brand: Brand) => ACOL[brand][Math.min(k, 2)]

/**
 * Realizações e cadernos (`att_rows`): uma linha por realização + checkbox de seleção p/ comparar,
 * downloads em dois grupos. `sel`/`onToggleSel` controlam a seleção (compartilhada com Comparar).
 */
export function AttRows({
  brand,
  data,
  mobile,
  sel,
  onToggleSel,
  onAll,
  onNone,
}: {
  brand: Brand
  data: ResultadoInternoData
  mobile: boolean
  sel: Record<number, boolean>
  onToggleSel: (n: number) => void
  onAll: () => void
  onNone: () => void
}) {
  const atts = data.tentativas
  const na = atts.length
  const cols = ACOL[brand]
  const r = brand === 'revisao' ? 16 : brand === 'vnd' ? 18 : 10
  const best = atts.reduce((bi, a, i, arr) => ((a.nota ?? -1) > (arr[bi].nota ?? -1) ? i : bi), 0)
  const nsel = atts.filter((a) => sel[a.n]).length

  if (!na) {
    return (
      <Card brand={brand} pad={mobile ? '16px' : '20px 22px'}>
        <Head brand={brand} icon={Layers} title="Realizações e cadernos" />
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhuma realização registrada.</span>
      </Card>
    )
  }

  const selHeader = !mobile ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ color: 'var(--muted)' }}>
        <b style={{ color: 'var(--ink)' }}>{nsel}</b> de {na} selecionadas
      </span>
      <button type="button" onClick={onAll} className="rrz-ibtn" style={ministyle}>Todas</button>
      <button type="button" onClick={onNone} className="rrz-ibtn" style={ministyle}>Nenhuma</button>
    </div>
  ) : null

  return (
    <Card brand={brand} pad={mobile ? '16px' : '20px 22px'}>
      <Head brand={brand} icon={Layers} title="Realizações e cadernos" sub={`${na} ${na === 1 ? 'realização' : 'realizações'} · ${data.melhor.total} questões`} right={selHeader} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {atts.map((a, k) => {
          const cur = k === na - 1
          const pos = a.posicao !== null ? posFmt(a.posicao) : '—'
          const on = sel[a.n] ?? true
          const badge = (
            <span style={{ width: 34, height: 34, background: cols[Math.min(k, 2)], color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0, borderRadius: brand === 'vnd' ? '50%' : brand === 'meq' ? 9 : 11 }}>
              #{a.n}
            </span>
          )
          const check = (
            <button
              type="button"
              onClick={() => onToggleSel(a.n)}
              aria-pressed={on}
              aria-label={`Selecionar realização ${a.n}`}
              style={{ width: 20, height: 20, borderRadius: brand === 'meq' ? 5 : 6, border: `1.5px solid ${on ? attColor(k, brand) : 'var(--line2)'}`, background: on ? attColor(k, brand) : 'transparent', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
            >
              {on ? <Check size={13} strokeWidth={3} /> : null}
            </button>
          )
          const tags = (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, height: 18, marginTop: 2, whiteSpace: 'nowrap', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{a.data}</span>
              {cur ? <span style={{ height: 17, padding: '0 6px', borderRadius: 99, background: 'var(--chip)', color: acc(brand), fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>Atual</span> : null}
              {k === best ? (
                <span style={{ height: 17, padding: '0 6px', borderRadius: 99, background: 'rgba(232,169,58,.16)', color: '#C98A12', fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Crown size={10} />Melhor
                </span>
              ) : null}
            </div>
          )
          const name = (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {badge}
              <div style={{ minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)', whiteSpace: 'nowrap' }}>Realização {a.n}</b>
                {tags}
              </div>
            </div>
          )
          let nota: ReactNode
          if (a.nota === null) nota = <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>—</span>
          else if (brand === 'vnd') nota = <Vring nota={a.nota} size={40} />
          else nota = <b style={{ fontSize: 17, color: notec(a.nota)[0] }}>{fnum(a.nota)}</b>

          const inner = mobile ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {check}
                <div style={{ flex: 1, minWidth: 0 }}>{name}</div>
                {nota}
              </div>
              <div style={{ display: 'flex', gap: 14, margin: '10px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>
                <span><b style={{ color: 'var(--ink)' }}>{a.acertos}/{a.total}</b> acertos</span>
                <span><b style={{ color: 'var(--ink)' }}>{a.tempo}</b></span>
                <span><b style={{ color: 'var(--ink)' }}>{pos}</b> lugar</span>
              </div>
              {a.downloads?.length ? <div style={{ marginTop: 10 }}><CadernosInline downloads={a.downloads} brand={brand} mobile /></div> : null}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: '20px 34px minmax(0,1fr) 72px 86px 78px 56px', gap: 14, alignItems: 'center' }}>
                {check}
                <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted)' }}>{k + 1}</span>
                {name}
                {nota}
                <span style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.25 }}>
                  <b>{a.acertos}</b>
                  <span style={{ color: 'var(--muted)' }}>/{a.total}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{a.pct}% acerto</span>
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{a.tempo}</span>
                <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{pos}</span>
              </div>
              {/* cadernos DESTA realização, na MESMA linha, à direita */}
              <CadernosInline downloads={a.downloads ?? []} brand={brand} />
            </div>
          )
          return (
            <div
              key={k}
              style={{
                minHeight: mobile ? undefined : 60,
                display: mobile ? undefined : 'flex',
                flexDirection: mobile ? undefined : 'column',
                justifyContent: mobile ? undefined : 'center',
                boxSizing: 'border-box',
                padding: mobile ? 12 : '10px 14px',
                borderRadius: r,
                border: `1px solid ${on ? 'var(--line)' : 'var(--line)'}`,
                background: on ? 'var(--surface)' : 'var(--surface2)',
                transition: 'background .2s,border-color .2s',
              }}
            >
              {inner}
            </div>
          )
        })}
      </div>
      {/* Os cadernos agora ficam em CADA realização (coluna à direita). Só a nota de ajuda abaixo. */}
      {atts.some((a) => a.downloads?.length) ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)', fontSize: 11.5, color: 'var(--muted)' }}>
          <Info size={13} style={{ flexShrink: 0 }} />
          Cada realização tem seus próprios cadernos (caderno de questões, folha de respostas e gabarito comentado) à direita.
        </div>
      ) : null}
    </Card>
  )
}

// Cadernos de UMA realização — ícones de download na mesma linha (à direita). Cada tipo de caderno
// (sem gabarito + com gabarito quando liberado) vira um botão-ícone com o nome no tooltip.
function CadernosInline({ downloads, brand, mobile }: { downloads: { nome: string; href: string; comGab: boolean }[]; brand: Brand; mobile?: boolean }) {
  if (!downloads.length) return null
  const semGab = downloads.filter((d) => !d.comGab)
  const comGab = downloads.filter((d) => d.comGab)
  const Btn = (d: { nome: string; href: string; comGab: boolean }, i: number) => (
    <a
      key={(d.comGab ? 'g' : 's') + i}
      href={d.href}
      download
      title={`Baixar ${d.nome}${d.comGab ? ' (com gabarito)' : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 9, border: `1px solid ${d.comGab ? 'color-mix(in srgb, ' + acc(brand) + ' 45%, var(--line))' : 'var(--line)'}`, background: d.comGab ? 'var(--chip)' : 'var(--surface2)', color: d.comGab ? acc(brand) : 'var(--ink)', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', textDecoration: 'none', flexShrink: 0 }}
    >
      <Download size={13} style={{ flexShrink: 0 }} />{d.nome}
    </a>
  )
  return (
    // Desktop: tudo na MESMA linha, à direita. MOBILE: QUEBRA em várias linhas (flex-wrap) e alinha à
    // esquerda — senão os botões (flexShrink:0 + nowrap) estouravam a tela e saíam cortados.
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: mobile ? 'wrap' : 'nowrap', justifyContent: mobile ? 'flex-start' : 'flex-end' }}>
      {semGab.map(Btn)}
      {semGab.length && comGab.length ? <span aria-hidden style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 3px', flexShrink: 0 }} /> : null}
      {comGab.map(Btn)}
    </div>
  )
}

const ministyle: CSSProperties = { height: 26, padding: '0 9px', borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', font: 'inherit', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }

// ───────────────────────────── comparar realizações ─────────────────────────

const delta = (a: number | null, b: number | null): ReactNode => {
  if (a === null || b === null) return <span style={{ color: 'var(--muted)' }}>—</span>
  const d = Math.round((b - a) * 10) / 10
  if (d === 0) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--muted)' }}><Minus size={12} />0</span>
  const up = d > 0
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: up ? OK : ERR, fontWeight: 800 }}>
      {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {up ? '+' : ''}{fnum(d)}
    </span>
  )
}

/** Comparar realizações — tabela Métrica×realização + Evolução + 4 tiles de transição + barcode. */
export function CompareCard({ brand, data, mobile, sel }: { brand: Brand; data: ResultadoInternoData; mobile: boolean; sel: Record<number, boolean> }) {
  const atts = data.tentativas.filter((a) => sel[a.n] ?? true)
  const cols = ACOL[brand]
  if (data.tentativas.length < 2) return null

  const first = atts[0]
  const last = atts[atts.length - 1]
  const hasTwo = atts.length >= 2

  const metrics: [string, (a: ResTentativa) => string, (a: ResTentativa) => number | null][] = [
    ['Nota', (a) => (a.nota !== null ? fnum(a.nota) : '—'), (a) => a.nota],
    ['Acertos', (a) => `${a.acertos}`, (a) => a.acertos],
    ['Erros', (a) => `${a.erros}`, (a) => -a.erros],
    ['Em branco', (a) => `${a.branco}`, (a) => -a.branco],
    ['Tempo total', (a) => a.tempo, () => null],
    ['Posição', (a) => (a.posicao !== null ? posFmt(a.posicao) : '—'), (a) => (a.posicao !== null ? -a.posicao : null)],
  ]

  // transições entre as 2 últimas selecionadas
  let up = 0, down = 0, keepOk = 0, keepErr = 0
  if (hasTwo && first.mapa && last.mapa) {
    const prevMapa = atts[atts.length - 2].mapa!
    const currMapa = last.mapa
    for (let i = 0; i < currMapa.length; i++) {
      const p = prevMapa[i] === 'certa'
      const c = currMapa[i] === 'certa'
      if (!p && c) up++
      else if (p && !c) down++
      else if (p && c) keepOk++
      else keepErr++
    }
  }
  const transitions: [string, number, string][] = [
    ['Passou a acertar', up, OK],
    ['Passou a errar', down, ERR],
    ['Continua acertando', keepOk, 'var(--muted)'],
    ['Continua errando', keepErr, 'var(--muted)'],
  ]

  return (
    <Card brand={brand} pad={mobile ? '18px' : '22px'}>
      <Head brand={brand} icon={RefreshCw} title="Comparar realizações" sub={`${atts.length} selecionadas · ${data.melhor.total} questões`} />
      <div className="rrz-hs" style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: mobile ? 460 : undefined }}>
          <div style={{ display: 'flex', gap: 8, padding: '0 0 8px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ flex: 1.4, minWidth: 0 }}><Capt>Métrica</Capt></span>
            {atts.map((a) => (
              <span key={a.n} style={{ flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cols[Math.min(a.n - 1, 2)] }} />
                <Capt>#{a.n}</Capt>
              </span>
            ))}
            <span style={{ flex: 1, minWidth: 0 }}><Capt>Evolução</Capt></span>
          </div>
          {metrics.map(([lab, f, val]) => (
            <div key={lab} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 12.5 }}>
              <span style={{ flex: 1.4, minWidth: 0, color: 'var(--muted)' }}>{lab}</span>
              {atts.map((a) => (
                <b key={a.n} style={{ flex: 1, minWidth: 0, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{f(a)}</b>
              ))}
              <span style={{ flex: 1, minWidth: 0, fontSize: 12 }}>{hasTwo ? delta(val(first), val(last)) : <span style={{ color: 'var(--muted)' }}>—</span>}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 4 tiles de transição (entre as 2 últimas selecionadas) */}
      {hasTwo ? (
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 8, marginTop: 14 }}>
          {transitions.map(([lab, v, c]) => (
            <div key={lab} style={{ padding: '10px 12px', borderRadius: brand === 'meq' ? 10 : 14, background: 'var(--surface2)', border: '1px solid var(--line)' }}>
              <b style={{ display: 'block', fontSize: 20, color: c === 'var(--muted)' ? 'var(--ink)' : c }}>{v}</b>
              <span style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.3 }}>{lab}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 12, color: 'var(--muted)' }}>
          <Info size={14} />Selecione ao menos 2 realizações para ver a evolução.
        </div>
      )}

      {/* barcode: 1 linha por realização, 1 traço por questão */}
      {atts.some((a) => a.mapa) ? (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <Capt>Mapa de respostas por realização</Capt>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {atts.filter((a) => a.mapa).map((a) => (
              <div key={a.n} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 26, fontSize: 11, fontWeight: 800, color: cols[Math.min(a.n - 1, 2)] }}>#{a.n}</span>
                <div style={{ flex: 1, display: 'flex', gap: 1, height: 16 }}>
                  {a.mapa!.map((st, i) => (
                    <span key={i} className="rrz-bar" style={{ flex: 1, minWidth: 0, background: stc(st).c, borderRadius: 1, animationDelay: `${i * 0.004}s` }} title={`Q${i + 1} · ${stc(st).lab}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  )
}

// ───────────────────────────── CTA revisar/treinar ──────────────────────────

/** "O que revisar" (Rev) / "TREINO DOS SEUS ERROS" (VND) / "Prioridades de revisão" (MEQ). */
export function RevisarCard({ brand, data }: { brand: Brand; data: ResultadoInternoData }) {
  const lst = data.assuntosMaisErrados ?? []
  const label = brand === 'meq' ? 'Prioridades de revisão' : brand === 'vnd' ? 'Treino dos seus erros' : 'O que revisar'
  const cta = brand === 'meq' ? 'Gerar caderno' : brand === 'vnd' ? 'Começar treino' : 'Treinar erros'
  const href = data.treinarErrosHref ?? null

  if (brand === 'vnd') {
    return (
      <Card brand="vnd" pad="0" style={{ overflow: 'hidden', border: 0 }}>
        <div style={{ padding: 20, background: 'linear-gradient(135deg,#0B4A2E,#12643D)', color: '#FFFFFF' }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', color: '#86CFA6' }}>TREINO DOS SEUS ERROS</span>
          <b style={{ display: 'block', margin: '6px 0 4px', fontSize: 18, letterSpacing: '-0.02em' }}>
            {lst.reduce((s, a) => s + a.erros, 0)} questões para revisar
          </b>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#CFE3D7', lineHeight: 1.5 }}>
            Monte um simulado só com os assuntos que você mais errou e feche o ciclo de estudo.
          </p>
          {href ? (
            <a href={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', borderRadius: 13, background: 'linear-gradient(180deg,#F1D48A,#D8B45A)', color: '#2A1F02', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
              <Target size={14} />{cta}
            </a>
          ) : null}
        </div>
      </Card>
    )
  }

  return (
    <Card brand={brand}>
      <Head brand={brand} icon={Target} title={label} sub="Assuntos com mais erros neste simulado" right={<Btn brand={brand} icon={RefreshCw} kind="accent" href={href}>{cta}</Btn>} />
      {lst.length ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {lst.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: i ? '1px solid var(--line)' : undefined }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.assunto}</b>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{a.disciplina}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: ERR, whiteSpace: 'nowrap' }}>{a.erros} erro{a.erros > 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      ) : (
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Você não errou questões neste simulado. Excelente!</span>
      )}
    </Card>
  )
}

/** Card dourado RECOMPENSAS (VND) — +XP, questões viradas, medalha. */
export function RecompensasCard({ data }: { data: ResultadoInternoData }) {
  const m = data.melhor
  return (
    <Card brand="vnd" pad="0" style={{ overflow: 'hidden', border: 0 }}>
      <div style={{ padding: 20, background: 'linear-gradient(135deg,#F1D48A,#D8B45A)', color: '#2A1F02' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', opacity: 0.8 }}>RECOMPENSAS</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '6px 0 12px' }}>
          <b style={{ fontSize: 30, letterSpacing: '-0.03em' }}>+{m.xp ?? 0}</b>
          <span style={{ fontSize: 13, fontWeight: 800 }}>XP ganho</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, padding: '10px 12px', borderRadius: 14, background: 'rgba(42,31,2,.1)' }}>
            <b style={{ display: 'block', fontSize: 18 }}>{m.acertos}</b>
            <span style={{ fontSize: 10.5, fontWeight: 700 }}>questões viradas</span>
          </div>
          <div style={{ flex: 1, padding: '10px 12px', borderRadius: 14, background: 'rgba(42,31,2,.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Medal size={22} />
            <span style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.2 }}>Medalha<br />Superação</span>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ───────────────────────────── aba Questões (correção) ──────────────────────

const QFILTERS: [QStatus | 'all' | 'up' | 'down', string][] = [
  ['all', 'Todas'],
  ['errada', 'Com erro'],
  ['certa', 'Acertei'],
  ['branco', 'Em branco'],
  ['up', 'Melhorou'],
  ['down', 'Piorou'],
]
const PAGE = 20

function matchFilter(q: ResCorrecao, f: string): boolean {
  if (f === 'all') return true
  if (f === 'up') return q.mudanca === 'up'
  if (f === 'down') return q.mudanca === 'down'
  return q.status === f
}

function AltRow({ brand, alt, gabaritoLiberado }: { brand: Brand; alt: ResCorrecao['alternativas'][number]; gabaritoLiberado: boolean }) {
  const isGab = gabaritoLiberado && alt.correta
  const isUser = alt.usuario
  let bd = 'var(--line)', bg = 'transparent', dot = 'var(--surface2)', dink = 'var(--muted)'
  if (isGab) { bd = OK; bg = 'rgba(31,168,104,.08)'; dot = OK; dink = '#FFFFFF' }
  else if (isUser) { bd = ERR; bg = 'rgba(229,72,77,.07)'; dot = ERR; dink = '#FFFFFF' }
  const r = brand === 'revisao' ? 12 : brand === 'vnd' ? 16 : 8
  const h = brand === 'vnd' ? 52 : 46
  const dotR = brand === 'meq' ? 8 : '50%'
  const turma = alt.turmaPct
  return (
    <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 12, minHeight: h, padding: '0 12px', borderRadius: r, border: `1.5px solid ${bd}`, background: bg }}>
      {typeof turma === 'number' ? (
        <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${turma}%`, background: isGab ? 'rgba(31,168,104,.07)' : 'rgba(127,127,127,.05)' }} />
      ) : null}
      <span style={{ position: 'relative', width: 28, height: 28, borderRadius: dotR, background: dot, color: dink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, flexShrink: 0 }}>{alt.letra}</span>
      <b style={{ position: 'relative', flex: 1, fontSize: 14, color: 'var(--ink)' }}>{alt.texto}</b>
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
        {isGab ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, color: OK }}>
            <Check size={12} strokeWidth={3} />Gabarito
          </span>
        ) : null}
        {isUser ? (
          <span style={{ height: 22, padding: '0 8px', borderRadius: 99, background: isGab ? OK : ERR, color: '#FFFFFF', fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>Sua resposta</span>
        ) : null}
        {typeof turma === 'number' ? (
          <span title="Marcaram esta opção" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', minWidth: 34, textAlign: 'right' }}>{turma}%</span>
        ) : null}
      </span>
    </div>
  )
}

function Hdots({ hist }: { hist?: QStatus[] }) {
  if (!hist?.length) return null
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {hist.map((s, i) => (
        <span key={i} title={stc(s).lab} style={{ width: 8, height: 8, borderRadius: '50%', background: stc(s).c }} />
      ))}
    </span>
  )
}

function Qrow({ brand, item, mobile, open, onToggle, gabaritoLiberado }: { brand: Brand; item: ResCorrecao; mobile: boolean; open: boolean; onToggle: () => void; gabaritoLiberado: boolean }) {
  const { c, bg, lab } = stc(item.status)
  const r = brand === 'revisao' ? 14 : brand === 'vnd' ? 16 : 8
  const numR = brand === 'meq' ? 8 : brand === 'vnd' ? '50%' : 10
  const difLab = item.dificuldade === 'facil' ? 'Fácil' : item.dificuldade === 'media' ? 'Média' : item.dificuldade === 'dificil' ? 'Difícil' : null
  const num = <span style={{ width: 34, height: 34, borderRadius: numR, background: bg, color: c, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, flexShrink: 0 }}>{item.ordem}</span>
  const chevron = (
    <span style={{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .25s' }}>
      <ChevronDown size={15} />
    </span>
  )
  const toggleBtn = (
    <button type="button" onClick={onToggle} aria-label="Ver questão" aria-expanded={open} className="rrz-ibtn" style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
      {chevron}
    </button>
  )
  const mud =
    item.mudanca === 'up' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10.5, fontWeight: 800, color: OK }}><TrendingUp size={11} />Melhorou</span>
    : item.mudanca === 'down' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10.5, fontWeight: 800, color: ERR }}><TrendingDown size={11} />Piorou</span>
    : null
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {num}
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: open ? 'block' : '-webkit-box', fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.35, overflow: 'hidden', WebkitLineClamp: open ? undefined : 2, WebkitBoxOrient: 'vertical' }}>
          {item.enunciado}
        </b>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ height: 20, padding: '0 8px', borderRadius: 99, background: bg, color: c, fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>{lab}</span>
          {item.disciplina ? <span style={{ height: 20, padding: '0 8px', borderRadius: 99, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>{item.disciplina}{difLab ? ` · ${difLab}` : ''}</span> : null}
          {typeof item.turmaPct === 'number' ? <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Turma {item.turmaPct}%</span> : null}
        </span>
      </div>
      {!mobile ? <Hdots hist={item.historico} /> : null}
      {mud}
      {toggleBtn}
    </div>
  )
  const detail = open ? (
    <div className="rrz-pv" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {item.alternativas.map((alt) => (
          <AltRow key={alt.letra} brand={brand} alt={alt} gabaritoLiberado={gabaritoLiberado} />
        ))}
      </div>
      {item.comentario ? (
        <div style={{ display: 'flex', gap: 12, padding: 14, borderRadius: brand === 'meq' ? 10 : 14, background: 'var(--surface2)' }}>
          <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--chip)', color: acc(brand), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><GraduationCap size={16} /></span>
          <div>
            <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>Comentário do professor</b>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted)' }}>{item.comentario}</p>
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn brand={brand} icon={Bookmark}>Salvar</Btn>
        <Btn brand={brand} icon={RefreshCw}>Refazer questão</Btn>
        <Btn brand={brand} icon={Flag}>Reportar</Btn>
      </div>
    </div>
  ) : null
  return (
    <div className="rrz-rowh" style={{ padding: mobile ? 12 : '12px 14px', borderRadius: r, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: brand === 'revisao' ? `inset 3px 0 0 ${c}` : undefined }}>
      {header}
      {detail}
    </div>
  )
}

/** Filtros de status (todas/erro/acertei/branco/melhorou/piorou) com contagem. */
export function QFilters({ brand, data, qf, setQf, showGerar }: { brand: Brand; data: ResultadoInternoData; qf: string; setQf: (f: string) => void; showGerar?: boolean }) {
  const r = brand === 'meq' ? 8 : 99
  const count = (f: string) => data.correcao.filter((q) => matchFilter(q, f)).length
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <div className="rrz-hs" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
        {QFILTERS.map(([f, lab]) => {
          const on = qf === f
          return (
            <button
              key={f}
              type="button"
              onClick={() => setQf(f)}
              aria-pressed={on}
              style={{ flexShrink: 0, height: 34, padding: '0 13px', borderRadius: r, border: '1px solid var(--line)', background: on ? 'var(--flag)' : 'transparent', color: on ? 'var(--fOnInk)' : 'var(--muted)', font: 'inherit', fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', cursor: 'pointer' }}
            >
              {lab}
              <span style={{ opacity: 0.7 }}>{count(f)}</span>
            </button>
          )
        })}
      </div>
      {showGerar ? <Btn brand={brand} icon={Target} kind="accent" href={data.treinarErrosHref}>Gerar simulado com meus erros</Btn> : null}
    </div>
  )
}

/** Correção questão-a-questão (de `data.correcao`): filtro por status + paginação local (20). */
export function QList({ brand, data, mobile, qf, pg, setPg, openMap, toggleOpen }: { brand: Brand; data: ResultadoInternoData; mobile: boolean; qf: string; pg: number; setPg: (p: number) => void; openMap: Record<number, boolean>; toggleOpen: (ordem: number) => void }) {
  const list = useMemo(() => data.correcao.filter((q) => matchFilter(q, qf)), [data.correcao, qf])
  const total = list.length
  const maxpg = Math.max(1, Math.ceil(total / PAGE))
  const page = Math.min(pg, maxpg - 1)
  const slice = list.slice(page * PAGE, page * PAGE + PAGE)
  const a = total === 0 ? 0 : page * PAGE + 1
  const b = Math.min(total, (page + 1) * PAGE)

  const pager =
    maxpg > 1 ? (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          Mostrando <b style={{ color: 'var(--ink)' }}>{a}–{b}</b> de <b style={{ color: 'var(--ink)' }}>{total}</b> questões
        </span>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {Array.from({ length: maxpg }).map((_, p) => {
            const on = p === page
            return (
              <button key={p} type="button" onClick={() => setPg(p)} aria-current={on} style={{ minWidth: 36, height: 36, padding: '0 8px', borderRadius: brand === 'meq' ? 8 : 10, border: '1px solid var(--line)', background: on ? 'var(--flag)' : 'transparent', color: on ? 'var(--fOnInk)' : 'var(--ink)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                {p + 1}
              </button>
            )
          })}
        </div>
      </div>
    ) : (
      <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        Mostrando <b style={{ color: 'var(--ink)' }}>{total}</b> {total === 1 ? 'questão' : 'questões'}
      </span>
    )

  const firstOrdem = data.correcao[0]?.ordem ?? -1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {pager}
      {total === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>Nenhuma questão neste filtro.</div>
      ) : (
        slice.map((item) => (
          <Qrow key={item.ordem} brand={brand} item={item} mobile={mobile} open={openMap[item.ordem] ?? item.ordem === firstOrdem} onToggle={() => toggleOpen(item.ordem)} gabaritoLiberado={data.gabaritoLiberado} />
        ))
      )}
      {maxpg > 1 ? <div style={{ marginTop: 4 }}>{pager}</div> : null}
    </div>
  )
}

// ───────────────────────────── ranking (completo) ───────────────────────────

function RankKpis({ brand, data, mobile }: { brand: Brand; data: ResultadoInternoData; mobile: boolean }) {
  const r = data.ranking
  if (!r) return null
  const kpis: [LucideIcon, string, string][] = [
    [Users, r.participantes.toLocaleString('pt-BR'), 'Participantes'],
    [Crown, posFmt(r.posicao), 'Sua posição'],
    [TrendingUp, `${r.percentil}%`, 'Melhor ou igual a'],
    [Target, fnum(r.mediaTurma), 'Média da turma'],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${mobile ? 2 : 4},1fr)`, gap: 10 }}>
      {kpis.map(([Icon, v, l], k) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', borderRadius: brand === 'revisao' ? 16 : brand === 'meq' ? 12 : 20, background: 'var(--surface)', border: '1px solid var(--line)' }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--chip)', color: acc(brand), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={17} />
          </span>
          <div style={{ minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 19, color: 'var(--ink)' }}>{v}</b>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function HistBlock({ brand, data }: { brand: Brand; data: ResultadoInternoData }) {
  const r = data.ranking
  if (!r) return null
  const max = Math.max(...r.histograma.map((h) => h.qtd), 1)
  const myNota = data.melhor.nota ?? 0
  return (
    <Card brand={brand}>
      <Head brand={brand} icon={BarChart3} title="Distribuição das notas" sub={`Você · ${fnum(myNota)}`} />
      <div style={{ position: 'relative', height: 140, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        <span style={{ position: 'absolute', top: 0, bottom: 18, left: `${r.mediaMarcador}%`, width: 0, borderLeft: '1.5px dashed color-mix(in srgb,var(--ink) 45%,transparent)', pointerEvents: 'none' }} />
        {r.histograma.map((h, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
            <span className="rrz-grow" title={`${h.faixa} · ${h.qtd}`} style={{ width: '100%', height: `${(h.qtd / max) * 100}%`, background: h.voce ? acc(brand) : 'var(--track)', borderRadius: '4px 4px 0 0', animationDelay: `${i * 0.03}s` }} />
            <span style={{ fontSize: 9.5, color: 'var(--muted)' }}>{h.faixa.split('-')[0]}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 11.5, color: 'var(--muted)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: acc(brand) }} />Você</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 0, borderTop: '1.5px dashed var(--ink)', opacity: 0.6 }} />Média {fnum(r.mediaTurma)}</span>
      </div>
    </Card>
  )
}

function VoceTurmaBlock({ brand, data }: { brand: Brand; data: ResultadoInternoData }) {
  return (
    <Card brand={brand}>
      <Head brand={brand} icon={Users} title="Você x turma por disciplina" />
      <div>
        {data.porDisciplina.map((di) => (
          <div key={di.nome} style={{ padding: '9px 0', borderTop: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 7 }}>
              <b style={{ fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{di.nome}</b>
              <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                <b style={{ color: notec(di.pct)[0] }}>{di.pct}%</b> · turma {di.turmaPct ?? '—'}%
              </span>
            </div>
            <BarTurma pct={di.pct} color={notec(di.pct)[0]} turma={di.turmaPct} h={8} />
          </div>
        ))}
      </div>
    </Card>
  )
}

function PeerRow({ peer, brand, highlight }: { peer: ResRankPeer; brand: Brand; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: brand === 'meq' ? 8 : 12, background: highlight ? 'var(--chip)' : 'transparent', border: highlight ? `1px solid color-mix(in srgb,${acc(brand)} 35%,transparent)` : '1px solid transparent' }}>
      <span style={{ width: 26, fontSize: 12, fontWeight: 800, color: 'var(--muted)', textAlign: 'center' }}>{peer.posicao}º</span>
      <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--surface2)', color: highlight ? acc(brand) : 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {peer.voce ? <User size={15} /> : <span style={{ fontSize: 10, fontWeight: 800 }}>{peer.iniciais.replace(/\s/g, '')}</span>}
      </span>
      <b style={{ flex: 1, fontSize: 13, color: highlight ? acc(brand) : 'var(--ink)' }}>{peer.voce ? 'Você' : peer.iniciais}</b>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{peer.acertos} ac.</span>
      <b style={{ fontSize: 13, color: notec(peer.nota)[0], minWidth: 42, textAlign: 'right' }}>{fnum(peer.nota)}</b>
    </div>
  )
}

function ClassifBlock({ brand, data }: { brand: Brand; data: ResultadoInternoData }) {
  const r = data.ranking
  if (!r) return null
  const inTop = r.top.some((p) => p.posicao === r.voce.posicao)
  return (
    <Card brand={brand}>
      <Head brand={brand} icon={Trophy} title="Classificação" sub={`${r.participantes.toLocaleString('pt-BR')} participantes`} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {r.top.map((p) => (
          <PeerRow key={p.posicao} peer={p} brand={brand} />
        ))}
        {!inTop ? (
          <>
            <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--muted)', padding: '2px 0' }}>···</div>
            <PeerRow peer={r.voce} brand={brand} highlight />
          </>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
        <Lock size={12} />Outros alunos aparecem de forma anônima.
      </div>
    </Card>
  )
}

function DificeisBlock({ brand, data }: { brand: Brand; data: ResultadoInternoData }) {
  const r = data.ranking
  if (!r) return null
  return (
    <Card brand={brand}>
      <Head brand={brand} icon={Flag} title="Questões mais difíceis para a turma" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {r.dificeis.map((q) => (
          <div key={q.ordem} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--line)' }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: stc(q.seuStatus).bg, color: stc(q.seuStatus).c, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{q.ordem}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.disciplina}</b>
              <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Turma acertou {q.turmaPct}%</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, color: stc(q.seuStatus).c }}>{stc(q.seuStatus).lab}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

/** Pódio VND (3 colunas 2-1-3). Iniciais apenas. */
function PodioBlock({ data }: { data: ResultadoInternoData }) {
  const podio = data.ranking?.podio
  if (!podio) return null
  const order = [podio[1], podio[0], podio[2]] // 2-1-3
  const heights = [92, 120, 76]
  const medals = ['#C0C0C0', '#F1D48A', '#CD7F32']
  return (
    <Card brand="vnd" pad="0" style={{ overflow: 'hidden', border: 0 }}>
      <div style={{ padding: '18px 16px 20px', background: 'linear-gradient(160deg,#0B4A2E,#041A10)', color: '#FFFFFF' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', color: '#86CFA6' }}>PÓDIO DO SIMULADO</span>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 10, marginTop: 16 }}>
          {order.map((p, i) => {
            const rank = i === 0 ? 2 : i === 1 ? 1 : 3
            return (
              <div key={p.posicao} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <span style={{ width: i === 1 ? 44 : 36, height: i === 1 ? 44 : 36, borderRadius: '50%', background: 'rgba(255,255,255,.12)', color: medals[rank - 1], display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Medal size={i === 1 ? 24 : 18} />
                </span>
                <b style={{ fontSize: 11.5 }}>{p.iniciais}</b>
                <span style={{ fontSize: 10.5, color: '#CFE3D7' }}>{fnum(p.nota)}</span>
                <div style={{ width: '100%', height: heights[i], borderRadius: '10px 10px 0 0', background: `linear-gradient(180deg,${medals[rank - 1]},rgba(255,255,255,.08))`, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 6, color: '#2A1F02', fontWeight: 800, fontSize: 16 }}>{rank}º</div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 10.5, color: '#CFE3D7' }}>
          <Lock size={11} />Outros alunos aparecem de forma anônima.
        </div>
      </div>
    </Card>
  )
}

/** Nota de corte estimada (MEQ). */
function CorteBlock({ data }: { data: ResultadoInternoData }) {
  const ce = data.ranking?.corteEstimado
  const nota = data.melhor.nota ?? 0
  if (!ce) return null
  const acima = nota >= ce.valor
  return (
    <Card brand="meq">
      <Head brand="meq" icon={Target} title="Nota de corte estimada" />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <b style={{ fontSize: 30, color: 'var(--ink)' }}>{fnum(ce.valor)}</b>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: acima ? OK : ERR }}>
          {acima ? '+' : ''}{fnum(ce.diff)} vs. sua nota
        </span>
      </div>
      <div style={{ position: 'relative', height: 14, display: 'flex', gap: 2 }}>
        {Array.from({ length: 20 }).map((_, i) => {
          const frac = (i + 1) / 20 * 100
          const filled = frac <= nota
          return <span key={i} style={{ flex: 1, borderRadius: 2, background: filled ? (acima ? OK : WARN) : 'var(--track)' }} />
        })}
        <span style={{ position: 'absolute', top: -4, bottom: -4, left: `${ce.valor}%`, width: 2, background: ERR }} title={`Corte ${ce.valor}`} />
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
        {acima
          ? `Sua nota está acima do corte estimado. Mantenha o ritmo.`
          : `Faltaram cerca de ${ce.faltam} questões para alcançar o corte estimado.`}
      </p>
    </Card>
  )
}

/** Aba Ranking completa — layout por marca. */
export function RankTab({ brand, data, mobile }: { brand: Brand; data: ResultadoInternoData; mobile: boolean }) {
  if (!data.ranking) {
    return (
      <Card brand={brand}>
        <Head brand={brand} icon={Users} title="Ranking" />
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Classificação indisponível.</span>
      </Card>
    )
  }
  const hist = <HistBlock brand={brand} data={data} />
  const disc = <VoceTurmaBlock brand={brand} data={data} />
  const classif = <ClassifBlock brand={brand} data={data} />
  const dificeis = <DificeisBlock brand={brand} data={data} />
  const gap = mobile ? 14 : 16

  if (mobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        <RankKpis brand={brand} data={data} mobile />
        {brand === 'vnd' ? <PodioBlock data={data} /> : null}
        {hist}
        {brand === 'meq' ? <CorteBlock data={data} /> : null}
        {disc}
        {classif}
        {dificeis}
      </div>
    )
  }

  if (brand === 'vnd') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        <RankKpis brand="vnd" data={data} mobile={false} />
        <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0,1fr) minmax(0,1fr)', gap, alignItems: 'start' }}>
          <PodioBlock data={data} />
          <div style={{ display: 'flex', flexDirection: 'column', gap }}>{classif}{disc}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap }}>{hist}{dificeis}</div>
        </div>
      </div>
    )
  }

  if (brand === 'meq') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        <RankKpis brand="meq" data={data} mobile={false} />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap, alignItems: 'start' }}>
          {hist}
          <CorteBlock data={data} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap, alignItems: 'start' }}>
          {disc}
          {dificeis}
          {classif}
        </div>
      </div>
    )
  }

  // Revisão — 1.5/1 [Hist, Disciplina | Classificação, Difíceis]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      <RankKpis brand="revisao" data={data} mobile={false} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap }}>{hist}{disc}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap }}>{classif}{dificeis}</div>
      </div>
    </div>
  )
}

// ───────────────────────────── avaliação (slot) ─────────────────────────────

/** Aba Avaliação — DESIGN novo do mockup (§2.5), FUNCIONAL: envia NPS/estrelas e report aos endpoints
 *  reais (/api/sessoes/avaliar e /api/sessoes/reportar-simulado) usando o `sessaoId` da melhor tentativa. */
export function TabAval({ brand, mobile, sessaoId }: { brand: Brand; mobile: boolean; sessaoId?: string | null }) {
  return <AvalMock brand={brand} mobile={mobile} sessaoId={sessaoId} />
}

const ASPECTS = ['Qualidade das questões', 'Comentários do professor', 'Fidelidade à banca', 'Plataforma e correção']
// chave = valor REAL do endpoint /api/sessoes/reportar-simulado.
const REPORT_CATS: [string, string][] = [
  ['erro_questao', 'Erro na questão'],
  ['erro_gabarito', 'Erro no gabarito'],
  ['problema_tecnico', 'Problema técnico'],
  ['sugestao', 'Sugestão'],
  ['outro', 'Outro'],
]

/** Formulário de avaliação/report — visual do mockup §2.5, envio REAL via fetch. */
function AvalMock({ brand, mobile, sessaoId }: { brand: Brand; mobile: boolean; sessaoId?: string | null }) {
  const [nps, setNps] = useState<number | null>(null)
  const [stars, setStars] = useState(0)
  const [dif, setDif] = useState<number | null>(null)
  const [aspects, setAspects] = useState<Record<number, number>>({})
  const [coment, setComent] = useState('')
  const [sent, setSent] = useState(false)
  const [enviandoAval, setEnviandoAval] = useState(false)
  const [rp, setRp] = useState('erro_questao')
  const [mensagem, setMensagem] = useState('')
  const [rsent, setRsent] = useState(false)
  const [enviandoRep, setEnviandoRep] = useState(false)

  const enviarAval = async () => {
    const nota = brand === 'vnd' ? (stars > 0 ? stars * 2 : null) : nps
    if (nota == null || enviandoAval) return
    setEnviandoAval(true)
    try {
      const res = await fetch('/api/sessoes/avaliar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessao_id: sessaoId, nps: nota, comentario: coment }),
      })
      if (res.ok) setSent(true)
    } catch {} finally { setEnviandoAval(false) }
  }
  const enviarReport = async () => {
    if (!mensagem.trim() || enviandoRep) return
    setEnviandoRep(true)
    try {
      const res = await fetch('/api/sessoes/reportar-simulado', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessao_id: sessaoId, tipo: rp, mensagem }),
      })
      if (res.ok) setRsent(true)
    } catch {} finally { setEnviandoRep(false) }
  }

  const npsColor = (n: number) => (n <= 6 ? ERR : n <= 8 ? WARN : OK)

  const nota =
    brand === 'vnd' ? (
      <div>
        <b style={{ display: 'block', fontSize: 13, color: 'var(--ink)', marginBottom: 10 }}>Como você avalia este simulado?</b>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} type="button" onClick={() => setStars(s)} aria-label={`${s} estrelas`} style={{ width: 44, height: 44, border: 0, background: 'transparent', color: s <= stars ? '#E8C877' : 'var(--line2)', cursor: 'pointer' }}>
              <Trophy size={30} fill={s <= stars ? '#E8C877' : 'none'} />
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{['Ruim', 'Regular', 'Bom', 'Ótimo', 'Excelente'][Math.max(0, stars - 1)] ?? 'Toque nas estrelas'}</span>
      </div>
    ) : brand === 'meq' ? (
      <div>
        <b style={{ display: 'block', fontSize: 13, color: 'var(--ink)', marginBottom: 10 }}>De 0 a 10, quanto você recomendaria este simulado?</b>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {Array.from({ length: 11 }).map((_, n) => {
            const on = nps === n
            return (
              <button key={n} type="button" onClick={() => setNps(n)} style={{ flex: 1, minWidth: 34, height: 40, borderRadius: 7, border: `1.5px solid ${on ? '#306AB5' : 'var(--line)'}`, borderBottom: `3px solid ${npsColor(n)}`, background: on ? '#306AB5' : 'transparent', color: on ? '#FFFFFF' : 'var(--ink)', font: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{n}</button>
            )
          })}
        </div>
      </div>
    ) : (
      <div>
        <b style={{ display: 'block', fontSize: 13, color: 'var(--ink)', marginBottom: 10 }}>De 0 a 10, quanto você recomendaria este simulado?</b>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Array.from({ length: 11 }).map((_, n) => {
            const on = nps === n
            return (
              <button key={n} type="button" onClick={() => setNps(n)} style={{ width: 40, height: 40, borderRadius: 10, border: `1.5px solid ${on ? '#5B3FD0' : 'var(--line)'}`, background: on ? '#5B3FD0' : 'transparent', color: on ? '#FFFFFF' : 'var(--ink)', font: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>{n}</button>
            )
          })}
        </div>
      </div>
    )

  const avalCard = sent ? (
    <Card brand={brand}>
      <div className="rrz-pv" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8, padding: '28px 16px' }}>
        <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(31,168,104,.14)', color: OK, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Check size={26} strokeWidth={3} /></span>
        <b style={{ fontSize: 16, color: 'var(--ink)' }}>Obrigado pela avaliação!</b>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>+10 XP creditados.</span>
      </div>
    </Card>
  ) : (
    <Card brand={brand}>
      <Head brand={brand} icon={MessageSquare} title="Avaliar simulado" sub="Sua opinião ajuda a melhorar os próximos" right={<span style={{ height: 22, padding: '0 8px', borderRadius: 99, background: 'var(--chip)', color: acc(brand), fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Zap size={11} />+10 XP</span>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {nota}
        <div>
          <b style={{ display: 'block', fontSize: 13, color: 'var(--ink)', marginBottom: 8 }}>Nível de dificuldade percebido</b>
          <div style={{ display: 'flex', gap: 8 }}>
            {['Fácil', 'Adequado', 'Difícil'].map((l, i) => {
              const on = dif === i
              return (
                <button key={l} type="button" onClick={() => setDif(i)} style={{ flex: 1, height: 38, borderRadius: 12, border: `1.5px solid ${on ? acc(brand) : 'var(--line)'}`, background: on ? 'var(--chip)' : 'transparent', color: on ? acc(brand) : 'var(--ink)', font: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
              )
            })}
          </div>
        </div>
        <div>
          <Capt>Avalie cada aspecto</Capt>
          <div style={{ marginTop: 6 }}>
            {ASPECTS.map((asp, ai) => (
              <div key={asp} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: ai ? '1px solid var(--line)' : undefined }}>
                <span style={{ fontSize: 13, color: 'var(--ink)' }}>{asp}</span>
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} type="button" onClick={() => setAspects((m) => ({ ...m, [ai]: s }))} aria-label={`${s}`} style={{ width: 20, height: 20, border: 0, background: 'transparent', color: s <= (aspects[ai] ?? 0) ? '#E8C877' : 'var(--line2)', cursor: 'pointer', padding: 0 }}>
                      <Trophy size={15} fill={s <= (aspects[ai] ?? 0) ? '#E8C877' : 'none'} />
                    </button>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
        <textarea value={coment} onChange={(e) => setComent(e.target.value)} rows={3} maxLength={1000} placeholder="Quer contar o porquê? (opcional)"
          style={{ minHeight: 84, padding: '12px 14px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface2)', fontSize: 13, color: 'var(--ink)', resize: 'vertical', font: 'inherit', outline: 'none' }} />
        <div>
          <button type="button" onClick={enviarAval} disabled={enviandoAval || (brand === 'vnd' ? stars === 0 : nps == null)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 18px', border: 0, borderRadius: 13, background: acc(brand), color: '#FFFFFF', font: 'inherit', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', opacity: enviandoAval || (brand === 'vnd' ? stars === 0 : nps == null) ? 0.5 : 1 }}><Check size={14} />Enviar avaliação</button>
        </div>
      </div>
    </Card>
  )

  const reportCard = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {rsent ? (
        <Card brand={brand}>
          <div className="rrz-pv" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8, padding: '24px 16px' }}>
            <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(31,168,104,.14)', color: OK, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Check size={22} strokeWidth={3} /></span>
            <b style={{ fontSize: 15, color: 'var(--ink)' }}>Report enviado</b>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Resposta em até 48h úteis.</span>
          </div>
        </Card>
      ) : (
        <Card brand={brand}>
          <Head brand={brand} icon={Flag} title="Reportar problema" sub="Resposta em até 48h úteis" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {REPORT_CATS.map(([k, l]) => {
                const on = rp === k
                return (
                  <button key={k} type="button" onClick={() => setRp(k)} style={{ height: 32, padding: '0 11px', borderRadius: brand === 'meq' ? 8 : 99, border: `1px solid ${on ? acc(brand) : 'var(--line)'}`, background: on ? 'var(--chip)' : 'transparent', color: on ? acc(brand) : 'var(--muted)', font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
                )
              })}
            </div>
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} maxLength={1000} placeholder="Descreva o problema ou a sugestão…"
              style={{ minHeight: 76, padding: '12px 14px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface2)', fontSize: 13, color: 'var(--ink)', resize: 'vertical', font: 'inherit', outline: 'none' }} />
            <div>
              <button type="button" onClick={enviarReport} disabled={enviandoRep || !mensagem.trim()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', border: 0, borderRadius: 12, background: acc(brand), color: '#FFFFFF', font: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: enviandoRep || !mensagem.trim() ? 0.5 : 1 }}><Flag size={14} />Enviar report</button>
            </div>
          </div>
        </Card>
      )}
      <Card brand={brand}>
        <Head brand={brand} icon={MessageSquare} title="Seus reports neste simulado" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[['Item 12 · gabarito', '18/09', 'Resolvido', OK], ['Item 47 · enunciado', '20/09', 'Em análise', WARN]].map(([t, d, s, c], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: i ? '1px solid var(--line)' : undefined }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 12.5, color: 'var(--ink)' }}>{t}</b>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{d}</span>
              </div>
              <span style={{ height: 22, padding: '0 9px', borderRadius: 99, background: `color-mix(in srgb,${c} 14%,transparent)`, color: c as string, fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>{s}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )

  if (mobile) return <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{avalCard}{reportCard}</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
      {avalCard}
      {reportCard}
    </div>
  )
}

// Helper de anel de nota exportado para os componentes de marca (VND).
export { Vring }
