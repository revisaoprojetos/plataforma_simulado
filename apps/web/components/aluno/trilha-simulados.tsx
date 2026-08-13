'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Check, Play, Star, Route, Zap, Trophy, CircleCheck, Download, Lock } from 'lucide-react'

export interface TrilhaNode {
  id: string
  titulo: string
  quando: string | null
  estado: 'concluido' | 'atual' | 'disponivel'
  acerto: number | null
  nota: number | null
  tentativas: number
  statusLabel: string
  questoes: number
  xp: number
  href: string | null
  acao: string
  capa: string | null
  capaBanner: string | null
  cadernoUrl: string | null
}
export interface Trilha {
  id: string
  nome: string
  cor: string | null
  total: number
  done: number
  trilhaXp: number
  nodes: TrilhaNode[]
}

const COR = 'var(--brand-primary, var(--primary))'
// Roxo dos botões dos cards de simulado de baixo (card-simulado.tsx: s.vis?.cor ?? '#6d28d9').
const BTN = '#6d28d9'

// Fecha o card lateral ao clicar fora dele (ignora cliques em nós, que trocam o card aberto).
function useCliqueForaFechar(ativo: boolean, setAberto: (v: null) => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ativo) return
    const onDown = (e: MouseEvent) => {
      const el = ref.current, t = e.target as HTMLElement
      if (el && el.contains(t)) return
      if (t.closest('[data-trilha-node]')) return
      setAberto(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [ativo, setAberto])
  return ref
}

// Card de um simulado. No hover: a info desliza (animada) até a esquerda e as ações surgem à direita.
function NodeCard({ n, gamAtivo }: { n: TrilhaNode; gamAtivo: boolean }) {
  const infoRef = useRef<HTMLDivElement>(null)
  const [dx, setDx] = useState(0)
  const concluido = n.estado === 'concluido'
  const atual = n.estado === 'atual'
  const meta = [n.quando, n.questoes > 0 ? `${n.questoes} questões` : null].filter(Boolean).join(' · ')

  function enter() {
    const el = infoRef.current
    if (el) setDx(-Math.max(0, el.offsetLeft - 16)) // desloca a info até ~16px da borda esquerda
  }
  const leave = () => setDx(0)

  const img = n.capaBanner
  const txtSec = img ? 'text-white/85' : 'text-muted-foreground'

  return (
    <div onMouseEnter={enter} onMouseLeave={leave}
      className={cn('group relative mb-4 mr-8 flex h-40 flex-1 items-center overflow-hidden rounded-2xl border px-5 text-center shadow-sm transition-all duration-200 hover:shadow-md motion-safe:hover:scale-[1.02]',
        img ? 'text-white' : 'bg-card', atual && 'border-primary/40')}>
      {/* Fundo: banner comprido do banco (capa_url, mesmo tamanho do card de personalizar) + degradê */}
      {img && (
        <>
          <img src={img} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-black/10" />
        </>
      )}

      {/* Info — centralizada; desliza suavemente para a esquerda no hover (medido + translateX) */}
      <div ref={infoRef} className={cn('relative mx-auto inline-block max-w-full text-left align-middle transition-transform duration-300 ease-out will-change-transform', img && '[text-shadow:0_1px_3px_rgba(0,0,0,0.7)]')} style={{ transform: `translateX(${dx}px)` }}>
        {atual && <span className="mb-1.5 inline-block rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">Comece aqui</span>}
        <div className="font-semibold leading-snug">{n.titulo}</div>
        <div className={cn('mt-1 text-xs', txtSec)}>
          {concluido ? <span className="inline-flex items-center gap-1"><CircleCheck className="h-3.5 w-3.5" /> Concluído</span> : (meta || 'Disponível')}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {concluido && n.acerto != null && <span className={cn('inline-flex items-center gap-1 text-sm font-medium', img ? 'text-white' : 'text-primary')}><CircleCheck className="h-4 w-4" /> {n.acerto}% de acerto</span>}
          {!concluido && gamAtivo && n.xp > 0 && <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', img ? 'bg-white/15 text-white' : 'border border-primary/40 text-primary')}><Zap className="h-3.5 w-3.5" /> +{n.xp} XP</span>}
          {n.tentativas > 0 && <span className={cn('rounded-full px-2 py-0.5 text-[11px]', img ? 'bg-white/15 text-white/85' : 'bg-muted text-muted-foreground')}>{n.tentativas}x</span>}
        </div>
      </div>

      {/* Ações — surgem no hover deslizando da direita */}
      <div className={cn('absolute inset-y-0 right-0 flex items-center gap-2.5 pl-14 pr-4 opacity-0 translate-x-4 transition-all duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-100',
        img ? 'bg-gradient-to-l from-black/90 via-black/80 to-transparent' : 'bg-gradient-to-l from-card via-card to-transparent')}>
        {n.href && (
          <Link href={n.href} className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
            <Play className="h-5 w-5" /> {n.acao}
          </Link>
        )}
        {n.cadernoUrl && (
          <a href={n.cadernoUrl} target="_blank" rel="noopener noreferrer" title="Baixar caderno de questões" aria-label="Baixar caderno de questões"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-muted-foreground transition hover:bg-muted hover:text-foreground">
            <Download className="h-5 w-5" />
          </a>
        )}
      </div>
    </div>
  )
}

// ── Design "caminho": trilha serpenteada (SVG curvo), nós clicáveis; card aparece no lado com mais espaço.
const LANE = 300, ROW = 150, R = 30, PAD = 34
const OFFS = [0, 66, 98, 66, 0, -66, -98, -66]

function TrilhaCaminho({ t, gamAtivo }: { t: Trilha; gamAtivo: boolean }) {
  const atualId = t.nodes.find((n) => n.estado === 'atual')?.id ?? t.nodes[0]?.id ?? null
  const [aberto, setAberto] = useState<string | null>(atualId)
  const cx = (off: number) => LANE / 2 + off
  const pts = t.nodes.map((_, i) => ({ off: OFFS[i % OFFS.length], y: PAD + i * ROW + R }))
  const chest = { off: OFFS[t.nodes.length % OFFS.length], y: PAD + t.nodes.length * ROW + R }
  const height = chest.y + R + 48
  const allPts = [...pts, chest]
  const openIdx = t.nodes.findIndex((n) => n.id === aberto)
  const open = openIdx >= 0 ? t.nodes[openIdx] : null
  const openPt = openIdx >= 0 ? pts[openIdx] : null
  const side = openPt && openPt.off > 0 ? 'left' : 'right' // card no lado OPOSTO à curva (mais espaço)
  const cardRef = useCliqueForaFechar(!!open, setAberto)

  return (
    <div className="relative mx-auto" style={{ width: LANE, height }}>
      {/* Conectores em curva */}
      <svg className="absolute left-0 top-0" width={LANE} height={height} aria-hidden>
        {allPts.slice(0, -1).map((p, i) => {
          const n = allPts[i + 1]
          const x0 = cx(p.off), y0 = p.y, x1 = cx(n.off), y1 = n.y, m = (y0 + y1) / 2
          const done = t.nodes[i]?.estado === 'concluido'
          return <path key={i} d={`M ${x0} ${y0} C ${x0} ${m}, ${x1} ${m}, ${x1} ${y1}`} fill="none" strokeWidth={6} strokeLinecap="round" strokeDasharray="0.1 16" stroke={done ? COR : 'var(--border)'} />
        })}
      </svg>

      {/* Nós */}
      {t.nodes.map((n, i) => {
        const p = pts[i]
        const concluido = n.estado === 'concluido'
        const atual = n.estado === 'atual'
        const bloqueado = n.estado === 'disponivel'
        const sel = n.id === aberto
        return (
          <div key={n.id} data-trilha-item className="absolute -translate-x-1/2 text-center" style={{ left: cx(p.off), top: p.y - R, width: 200, marginLeft: 0 }}>
            <button type="button" data-trilha-node onClick={() => setAberto(n.id)} aria-label={n.titulo}
              className={cn('relative mx-auto flex items-center justify-center rounded-full border-4 shadow-sm transition-transform hover:scale-105 focus:outline-none', sel && 'ring-4 ring-primary/25')}
              style={{ width: R * 2, height: R * 2, ...(concluido ? { background: COR, borderColor: `color-mix(in oklab, ${COR} 70%, #000)`, color: '#fff' }
                : atual ? { background: `color-mix(in oklab, ${COR} 16%, var(--card))`, borderColor: COR, color: COR }
                : { background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }) }}>
              {atual && <span className="pointer-events-none absolute inset-[-5px] rounded-full border-2 opacity-60 motion-safe:animate-ping" style={{ borderColor: COR }} />}
              {concluido ? <Check className="h-7 w-7" /> : atual ? <Star className="h-7 w-7" /> : <Lock className="h-6 w-6" />}
            </button>
            {/* Rótulo com fundo próprio p/ não se misturar ao pontilhado que passa atrás. */}
            <div className="relative z-[1] mt-1.5 inline-block max-w-full rounded-lg bg-background/85 px-1.5 py-0.5 backdrop-blur-sm">
              <span className={cn('block text-xs font-semibold leading-snug', bloqueado && 'text-muted-foreground')}>{n.titulo}</span>
              <span className="block text-[11px] text-muted-foreground">
                {concluido ? `Concluído${n.acerto != null ? ` · ${n.acerto}%` : ''}` : bloqueado ? 'Bloqueado' : (n.quando ?? 'Disponível')}
              </span>
            </div>
          </div>
        )
      })}

      {/* Baú */}
      <div className="absolute -translate-x-1/2 text-center" style={{ left: cx(chest.off), top: chest.y - R, width: 200 }}>
        <span className="mx-auto flex items-center justify-center rounded-2xl border-4" style={{ width: 56, height: 56, ...(t.done >= t.total ? { background: 'var(--brand-accent, #f59e0b)', borderColor: 'color-mix(in oklab, var(--brand-accent, #f59e0b) 70%, #000)', color: '#fff' } : { background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }) }}>
          <Trophy className="h-6 w-6" />
        </span>
        <div className="mt-1.5 text-xs font-semibold">Baú da trilha</div>
        <div className="text-[11px] text-muted-foreground">{t.done >= t.total ? 'Liberado! 🎉' : `${gamAtivo && t.trilhaXp > 0 ? `+${t.trilhaXp} XP` : 'Complete a trilha'}`}</div>
      </div>

      {/* Card do simulado — no lado com mais espaço, alinhado ao nó */}
      {open && openPt && (
        <div ref={cardRef} key={open.id} className="absolute z-10 w-[300px] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-200"
          style={{ top: Math.max(0, Math.min(openPt.y - 60, height - 210)), ...(side === 'right' ? { left: LANE + 20 } : { right: LANE + 20 }) }}>
          <span className={cn('absolute top-14 h-3 w-3 rotate-45 border bg-card', side === 'right' ? '-left-1.5 border-b-0 border-r-0' : '-right-1.5 border-l-0 border-t-0')} />
          <div className={cn('overflow-hidden rounded-2xl border shadow-xl motion-safe:animate-[trilha-card-pulse_2.2s_ease-in-out_infinite]', open.estado === 'atual' && 'border-primary/40')}>
            {open.capaBanner && <div className="relative h-20"><img src={open.capaBanner} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" /></div>}
            <div className="space-y-2 p-4">
              {open.estado === 'atual' && <span className="inline-block rounded-full border border-primary/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Comece aqui</span>}
              <div className="font-semibold leading-tight">{open.titulo}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {open.estado === 'concluido' ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CircleCheck className="h-3.5 w-3.5" /> Concluído</span>
                  : open.estado === 'disponivel' ? <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Desbloqueie concluindo o anterior</span>
                  : [open.quando, open.questoes > 0 ? `${open.questoes} questões` : null].filter(Boolean).join(' · ')}
                {open.acerto != null && <span className="inline-flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> {open.acerto}%</span>}
                {gamAtivo && open.xp > 0 && open.estado !== 'concluido' && <span className="inline-flex items-center gap-1 font-semibold text-primary"><Zap className="h-3.5 w-3.5" /> +{open.xp} XP</span>}
              </div>
              {open.href && open.estado !== 'disponivel' && (
                <div className="mt-1 flex items-center gap-2">
                  <Link href={open.href} style={{ ['--btn' as any]: BTN }}
                    className="group/btn relative inline-flex flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-xl border-[1.5px] border-[var(--btn)] px-4 py-2 text-sm font-semibold text-[var(--btn)] transition-all duration-300 hover:scale-[1.02] hover:text-white">
                    <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100" style={{ background: `linear-gradient(135deg, ${BTN}, color-mix(in oklab, ${BTN} 72%, #000))` }} />
                    <span className="relative z-10 inline-flex items-center gap-1.5">{open.estado === 'atual' && <Play className="h-4 w-4" />}{open.acao}</span>
                  </Link>
                  {open.cadernoUrl && (
                    <a href={open.cadernoUrl} target="_blank" rel="noopener noreferrer" title="Baixar caderno de questões" aria-label="Baixar caderno de questões"
                      className="group/dl relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border-[1.5px] border-white/80 text-white transition-all hover:scale-[1.03]">
                      <span className="absolute inset-0 bg-white opacity-0 transition-opacity duration-300 group-hover/dl:opacity-100" />
                      <Download className="relative z-10 h-4 w-4 text-white transition-colors group-hover/dl:text-[color:var(--btn,#6d28d9)]" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function TrilhaSimulados({ trilhas, gamAtivo, estilo = 'cards', visiveis = 3 }: { trilhas: Trilha[]; gamAtivo: boolean; estilo?: 'cards' | 'caminho'; visiveis?: number }) {
  const caminho = estilo === 'caminho'
  const [ativa, setAtiva] = useState(trilhas[0]?.id)
  const t = trilhas.find((x) => x.id === ativa) ?? trilhas[0]
  const rolar = t ? visiveis > 0 && t.nodes.length > visiveis : false

  // Altura animada: mostra `visiveis` simulados (0 = todos) medindo o N-ésimo nó; transiciona
  // ao trocar de trilha/estilo em vez de "pular" seco.
  const olRef = useRef<HTMLDivElement>(null)
  const [maxH, setMaxH] = useState<number | null>(null)
  useEffect(() => {
    const el = olRef.current
    if (!el) return
    const medir = () => {
      if (visiveis <= 0) { setMaxH(el.scrollHeight); return }
      const items = el.querySelectorAll('[data-trilha-item]')
      if (items.length <= visiveis) { setMaxH(el.scrollHeight); return }
      const nth = items[visiveis] as HTMLElement
      const h = nth.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop + 28 // + "pedaço" do próximo
      setMaxH(Math.round(h))
    }
    medir()
    const raf = requestAnimationFrame(medir)
    window.addEventListener('resize', medir)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', medir) }
  }, [ativa, estilo, visiveis, t?.nodes.length])

  if (!t) return null
  const pct = t.total ? Math.round((t.done / t.total) * 100) : 0

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight"><Route className="h-5 w-5 text-primary" /> Trilhas de simulados</h2>
        <p className="text-sm text-muted-foreground">Todos os simulados ficam disponíveis — faça na ordem que quiser.</p>
      </div>

      {trilhas.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {trilhas.map((tr) => (
            <button key={tr.id} type="button" onClick={() => setAtiva(tr.id)}
              className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                tr.id === t.id ? 'border-primary/40 bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {tr.nome}
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', tr.id === t.id ? 'bg-primary/20 text-primary' : 'bg-muted')}>{tr.done}/{tr.total}</span>
            </button>
          ))}
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span><span className="font-medium text-foreground">{t.nome}</span> · {t.done}/{t.total} concluídos</span>
          {gamAtivo && t.trilhaXp > 0 && <span>recompensa da trilha: <span className="font-semibold text-primary">+{t.trilhaXp} XP</span></span>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: COR }} />
        </div>
      </div>

      <div className="relative">
        <div ref={olRef} className="min-w-0 overflow-y-auto py-1 pr-1 transition-[max-height] duration-700 ease-out [scrollbar-width:thin]" style={{ maxHeight: maxH ?? undefined }}>
        <div key={ativa} className="min-w-0 space-y-0 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700">
          {caminho ? (
            <TrilhaCaminho t={t} gamAtivo={gamAtivo} />
          ) : (<>
          {t.nodes.map((n, i) => {
            const concluido = n.estado === 'concluido'
            const atual = n.estado === 'atual'
            return (
              <div key={n.id} data-trilha-item className="flex gap-4">
                <div className="flex flex-col items-center pt-3">
                  <span className="relative flex shrink-0 items-center justify-center rounded-full border-4 shadow-sm"
                    style={{ width: 52, height: 52, ...(concluido ? { background: COR, borderColor: `color-mix(in oklab, ${COR} 70%, #000)`, color: '#fff' }
                      : atual ? { background: `color-mix(in oklab, ${COR} 16%, var(--card))`, borderColor: COR, color: COR }
                      : { background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }) }}>
                    {atual && <span className="pointer-events-none absolute inset-[-5px] rounded-full border-2 opacity-60 motion-safe:animate-ping" style={{ borderColor: COR }} />}
                    {concluido ? <Check className="h-6 w-6" /> : atual ? <Star className="h-6 w-6" /> : <Play className="h-5 w-5" />}
                  </span>
                  {i < t.nodes.length - 1 && <span className="my-1 flex-1" style={{ width: 6, minHeight: 24, backgroundImage: `radial-gradient(circle, ${concluido ? COR : 'var(--border)'} 40%, transparent 44%)`, backgroundSize: '6px 12px', backgroundRepeat: 'repeat-y' }} />}
                </div>

                <NodeCard n={n} gamAtivo={gamAtivo} />
              </div>
            )
          })}

          <div className="flex items-center gap-4">
            <div className="flex w-[52px] justify-center">
              <span className="flex items-center justify-center rounded-full border-4" style={{ width: 48, height: 48, ...(t.done >= t.total ? { background: 'var(--brand-accent, #f59e0b)', borderColor: 'color-mix(in oklab, var(--brand-accent, #f59e0b) 70%, #000)', color: '#fff' } : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }) }}>
                <Trophy className="h-5 w-5" />
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{t.done >= t.total ? 'Trilha concluída! 🎉' : `Conclua os ${t.total} para o troféu da trilha.`}</span>
          </div>
          </>)}
        </div>
        </div>
        {rolar && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-2xl bg-gradient-to-t from-background to-transparent" />}
      </div>
    </section>
  )
}

// ── Trilha GIGANTE: todas as trilhas em UM caminho serpenteado contínuo, dividido por grupo,
// com o pontilhado seguindo entre os grupos. Usado na página dedicada /aluno/trilha.
const GAP_HDR = 58   // altura reservada p/ a divisória (nome do grupo)
const GAP_GRUPO = 44 // respiro extra entre grupos (o pontilhado continua nele)

export function TrilhaGigante({ trilhas, gamAtivo }: { trilhas: Trilha[]; gamAtivo: boolean }) {
  const flat = trilhas.flatMap((t) => t.nodes)
  const atualId = flat.find((n) => n.estado === 'atual')?.id ?? flat[0]?.id ?? null
  const [aberto, setAberto] = useState<string | null>(atualId)
  const cx = (off: number) => LANE / 2 + off

  // Layout: percorre grupos empilhando divisória + nós, guardando as posições.
  const nodesL: { n: TrilhaNode; off: number; y: number }[] = []
  const dividers: { id: string; nome: string; done: number; total: number; y: number }[] = []
  let y = PAD, gi = 0
  trilhas.forEach((t, ti) => {
    if (ti > 0) y += GAP_GRUPO
    dividers.push({ id: t.id, nome: t.nome, done: t.done, total: t.total, y })
    y += GAP_HDR
    t.nodes.forEach((n) => {
      const off = OFFS[gi % OFFS.length]
      nodesL.push({ n, off, y: y + R })
      y += ROW
      gi++
    })
  })
  const chest = { off: OFFS[gi % OFFS.length], y: y + R }
  const height = chest.y + R + 48
  const allPts = [...nodesL.map((x) => ({ off: x.off, y: x.y, estado: x.n.estado })), { off: chest.off, y: chest.y, estado: 'disponivel' as const }]

  const openL = nodesL.find((x) => x.n.id === aberto) ?? null
  const open = openL?.n ?? null
  const openPt = openL ? { off: openL.off, y: openL.y } : null
  const side = openPt && openPt.off > 0 ? 'left' : 'right'
  const cardRef = useCliqueForaFechar(!!open, setAberto)

  if (!nodesL.length) return null

  return (
    <div className="relative mx-auto" style={{ width: LANE, height }}>
      {/* Conectores pontilhados — contínuos, inclusive entre grupos */}
      <svg className="absolute left-0 top-0" width={LANE} height={height} aria-hidden>
        {allPts.slice(0, -1).map((p, i) => {
          const nx = allPts[i + 1]
          const x0 = cx(p.off), y0 = p.y, x1 = cx(nx.off), y1 = nx.y, m = (y0 + y1) / 2
          const done = p.estado === 'concluido'
          return <path key={i} d={`M ${x0} ${y0} C ${x0} ${m}, ${x1} ${m}, ${x1} ${y1}`} fill="none" strokeWidth={6} strokeLinecap="round" strokeDasharray="0.1 16" stroke={done ? COR : 'var(--border)'} />
        })}
      </svg>

      {/* Divisórias de grupo — cabeçalho de seção com linhas laterais; a legenda tem fundo próprio. */}
      {dividers.map((d) => {
        const pct = d.total ? Math.round((d.done / d.total) * 100) : 0
        const completo = d.total > 0 && d.done >= d.total
        return (
          <div key={d.id} className="absolute left-1/2 z-[2] -translate-x-1/2" style={{ top: d.y, width: 340 }}>
            <div className="flex items-center gap-2.5">
              <span className="h-px flex-1" style={{ background: 'linear-gradient(to right, transparent, var(--border))' }} />
              <div className="flex flex-col items-center gap-1 rounded-2xl border bg-card px-4 py-2 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: `color-mix(in oklab, ${COR} 16%, transparent)`, color: COR }}>
                    {completo ? <Trophy className="h-3.5 w-3.5" /> : <Route className="h-3.5 w-3.5" />}
                  </span>
                  <span className="max-w-[190px] truncate whitespace-nowrap text-sm font-bold" title={d.nome}>{d.nome}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums" style={{ background: `color-mix(in oklab, ${COR} 15%, transparent)`, color: COR }}>{d.done}/{d.total}</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: `color-mix(in oklab, ${COR} 14%, transparent)` }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: COR }} />
                </div>
              </div>
              <span className="h-px flex-1" style={{ background: 'linear-gradient(to left, transparent, var(--border))' }} />
            </div>
          </div>
        )
      })}

      {/* Nós */}
      {nodesL.map(({ n, off, y: cyv }) => {
        const concluido = n.estado === 'concluido'
        const atual = n.estado === 'atual'
        const bloqueado = n.estado === 'disponivel'
        const sel = n.id === aberto
        return (
          <div key={n.id} className="absolute z-[1] -translate-x-1/2 text-center" style={{ left: cx(off), top: cyv - R, width: 200 }}>
            <button type="button" data-trilha-node onClick={() => setAberto(n.id)} aria-label={n.titulo}
              className={cn('relative mx-auto flex items-center justify-center rounded-full border-4 shadow-sm transition-transform hover:scale-105 focus:outline-none', sel && 'ring-4 ring-primary/25')}
              style={{ width: R * 2, height: R * 2, ...(concluido ? { background: COR, borderColor: `color-mix(in oklab, ${COR} 70%, #000)`, color: '#fff' }
                : atual ? { background: `color-mix(in oklab, ${COR} 16%, var(--card))`, borderColor: COR, color: COR }
                : { background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }) }}>
              {atual && <span className="pointer-events-none absolute inset-[-5px] rounded-full border-2 opacity-60 motion-safe:animate-ping" style={{ borderColor: COR }} />}
              {concluido ? <Check className="h-7 w-7" /> : atual ? <Star className="h-7 w-7" /> : <Play className="h-6 w-6" />}
            </button>
            <div className="relative z-[1] mt-1.5 inline-block max-w-full rounded-lg bg-background/85 px-1.5 py-0.5 backdrop-blur-sm">
              <span className={cn('block text-xs font-semibold leading-snug', bloqueado && 'text-muted-foreground')}>{n.titulo}</span>
              <span className="block text-[11px] text-muted-foreground">
                {concluido ? `Concluído${n.acerto != null ? ` · ${n.acerto}%` : ''}` : (n.quando ?? 'Disponível')}
              </span>
            </div>
          </div>
        )
      })}

      {/* Baú final */}
      <div className="absolute z-[1] -translate-x-1/2 text-center" style={{ left: cx(chest.off), top: chest.y - R, width: 220 }}>
        <span className="mx-auto flex items-center justify-center rounded-2xl border-4" style={{ width: 56, height: 56, background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
          <Trophy className="h-6 w-6" />
        </span>
        <div className="mt-1.5 inline-block rounded-lg bg-background/85 px-2 py-0.5 backdrop-blur-sm">
          <span className="block text-xs font-semibold">Mais simulados em breve</span>
          <span className="block text-[11px] text-muted-foreground">Fique de olho — novos simulados chegam aqui.</span>
        </div>
      </div>

      {/* Card do simulado — no lado com mais espaço, alinhado ao nó */}
      {open && openPt && (
        <div ref={cardRef} key={open.id} className="absolute z-10 w-[300px] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-200"
          style={{ top: Math.max(0, Math.min(openPt.y - 60, height - 210)), ...(side === 'right' ? { left: LANE + 20 } : { right: LANE + 20 }) }}>
          <span className={cn('absolute top-14 h-3 w-3 rotate-45 border bg-card', side === 'right' ? '-left-1.5 border-b-0 border-r-0' : '-right-1.5 border-l-0 border-t-0')} />
          <div className={cn('overflow-hidden rounded-2xl border shadow-xl motion-safe:animate-[trilha-card-pulse_2.2s_ease-in-out_infinite]', open.estado === 'atual' && 'border-primary/40')}>
            {open.capaBanner && <div className="relative h-20"><img src={open.capaBanner} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" /></div>}
            <div className="space-y-2 p-4">
              {open.estado === 'atual' && <span className="inline-block rounded-full border border-primary/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Comece aqui</span>}
              <div className="font-semibold leading-tight">{open.titulo}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {open.estado === 'concluido' ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CircleCheck className="h-3.5 w-3.5" /> Concluído</span>
                  : [open.quando, open.questoes > 0 ? `${open.questoes} questões` : null].filter(Boolean).join(' · ')}
                {open.acerto != null && <span className="inline-flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> {open.acerto}%</span>}
                {gamAtivo && open.xp > 0 && open.estado !== 'concluido' && <span className="inline-flex items-center gap-1 font-semibold text-primary"><Zap className="h-3.5 w-3.5" /> +{open.xp} XP</span>}
              </div>
              {open.href && (
                <div className="mt-1 flex items-center gap-2">
                  <Link href={open.href} style={{ ['--btn' as any]: BTN }}
                    className="group/btn relative inline-flex flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-xl border-[1.5px] border-[var(--btn)] px-4 py-2 text-sm font-semibold text-[var(--btn)] transition-all duration-300 hover:scale-[1.02] hover:text-white">
                    <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100" style={{ background: `linear-gradient(135deg, ${BTN}, color-mix(in oklab, ${BTN} 72%, #000))` }} />
                    <span className="relative z-10 inline-flex items-center gap-1.5">{open.estado === 'atual' && <Play className="h-4 w-4" />}{open.acao}</span>
                  </Link>
                  {open.cadernoUrl && (
                    <a href={open.cadernoUrl} target="_blank" rel="noopener noreferrer" title="Baixar caderno de questões" aria-label="Baixar caderno de questões"
                      className="group/dl relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border-[1.5px] border-white/80 text-white transition-all hover:scale-[1.03]">
                      <span className="absolute inset-0 bg-white opacity-0 transition-opacity duration-300 group-hover/dl:opacity-100" />
                      <Download className="relative z-10 h-4 w-4 text-white transition-colors group-hover/dl:text-[color:var(--btn,#6d28d9)]" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
