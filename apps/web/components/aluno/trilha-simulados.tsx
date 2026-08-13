'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Check, Lock, Play, Star, Route, Zap, Trophy, ChevronRight } from 'lucide-react'

export interface TrilhaNode {
  id: string
  titulo: string
  quando: string | null
  estado: 'concluido' | 'atual' | 'bloqueado'
  acerto: number | null
  nota: number | null
  tentativas: number
  statusLabel: string
  xp: number
  href: string | null
  acao: string
  capa: string | null
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

export function TrilhaSimulados({ trilhas, gamAtivo }: { trilhas: Trilha[]; gamAtivo: boolean }) {
  const [ativa, setAtiva] = useState(trilhas[0]?.id)
  const t = trilhas.find((x) => x.id === ativa) ?? trilhas[0]
  const inicial = t?.nodes.find((n) => n.estado === 'atual')?.id ?? t?.nodes[0]?.id ?? null
  const [aberto, setAberto] = useState<string | null>(inicial)
  // Alinha a ponta do balão (setinha) à altura exata do nó selecionado.
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tailTop, setTailTop] = useState(40)
  useEffect(() => {
    function medir() {
      const node = nodeRefs.current[aberto ?? '']
      const wrap = wrapRef.current
      if (!node || !wrap) return
      const nr = node.getBoundingClientRect()
      const wr = wrap.getBoundingClientRect()
      const y = nr.top + nr.height / 2 - wr.top
      setTailTop(Math.max(14, Math.min(y, wr.height - 14)))
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [aberto, ativa])
  if (!t) return null
  const pct = t.total ? Math.round((t.done / t.total) * 100) : 0
  const open = t.nodes.find((n) => n.id === aberto) ?? null

  function trocar(id: string) {
    setAtiva(id)
    const tr = trilhas.find((x) => x.id === id)
    setAberto(tr?.nodes.find((n) => n.estado === 'atual')?.id ?? tr?.nodes[0]?.id ?? null)
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight"><Route className="h-5 w-5 text-primary" /> Trilhas de simulados</h2>
        <p className="text-sm text-muted-foreground">Conclua um simulado para desbloquear o próximo.</p>
      </div>

      {trilhas.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {trilhas.map((tr) => (
            <button key={tr.id} type="button" onClick={() => trocar(tr.id)}
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

      <div className="grid gap-5 rounded-2xl border bg-gradient-to-br from-muted/25 to-transparent p-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:p-5">
        {/* ── Timeline (esquerda) ── */}
        <ol className="min-w-0">
          {t.nodes.map((n, i) => {
            const concluido = n.estado === 'concluido'
            const atual = n.estado === 'atual'
            const bloqueado = n.estado === 'bloqueado'
            const sel = n.id === aberto
            return (
              <li key={n.id} className="flex gap-3">
                {/* Nó + conector */}
                <div className="flex flex-col items-center">
                  <button type="button" ref={(el) => { nodeRefs.current[n.id] = el }} onClick={() => setAberto(n.id)} aria-label={n.titulo}
                    className="relative flex shrink-0 items-center justify-center rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary"
                    style={{ width: 52, height: 52 }}>
                    {atual && <span className="pointer-events-none absolute inset-[-5px] rounded-full border-2 opacity-60 motion-safe:animate-ping" style={{ borderColor: COR }} />}
                    <span className={cn('flex h-full w-full items-center justify-center rounded-full border-4 shadow-sm', bloqueado && 'bg-muted text-muted-foreground/50', sel && 'ring-4 ring-primary/25')}
                      style={concluido ? { background: COR, borderColor: `color-mix(in oklab, ${COR} 70%, #000)`, color: '#fff' }
                        : atual ? { background: `color-mix(in oklab, ${COR} 16%, var(--card))`, borderColor: COR, color: COR }
                        : { borderColor: 'var(--border)' }}>
                      {concluido ? <Check className="h-6 w-6" /> : atual ? <Star className="h-6 w-6" /> : <Lock className="h-5 w-5" />}
                    </span>
                  </button>
                  <span className="my-1.5 w-1 flex-1 rounded-full" style={{ minHeight: 26, background: concluido ? COR : 'var(--border)' }} />
                </div>

                {/* Rótulo (clicável) */}
                <button type="button" onClick={() => setAberto(n.id)}
                  className={cn('mb-3 min-w-0 flex-1 rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                    sel ? 'border-primary/40 bg-primary/[0.06]' : 'border-transparent hover:bg-muted/50', bloqueado && 'opacity-70')}>
                  <div className="flex items-center gap-2">
                    {atual && <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground">Comece aqui</span>}
                    <span className="truncate text-sm font-semibold">{n.titulo}</span>
                    <ChevronRight className={cn('ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform', sel && 'rotate-90')} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    {concluido ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" /> Concluído{n.acerto != null ? ` · ${n.acerto}%` : ''}</span>
                      : bloqueado ? <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Bloqueado</span>
                      : <span>{n.quando ?? 'Disponível'}</span>}
                    {gamAtivo && n.xp > 0 && !concluido && <span className="inline-flex items-center gap-0.5 font-medium text-primary"><Zap className="h-3 w-3" /> +{n.xp}</span>}
                  </div>
                </button>
              </li>
            )
          })}

          {/* Troféu final */}
          <li className="flex items-center gap-3">
            <span className="flex items-center justify-center rounded-full border-4" style={{ width: 52, height: 52, ...(t.done >= t.total ? { background: 'var(--brand-accent, #f59e0b)', borderColor: 'color-mix(in oklab, var(--brand-accent, #f59e0b) 70%, #000)', color: '#fff' } : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }) }}>
              <Trophy className="h-6 w-6" />
            </span>
            <span className="text-xs text-muted-foreground">{t.done >= t.total ? 'Trilha concluída! 🎉' : `Conclua os ${t.total} para o troféu da trilha.`}</span>
          </li>
        </ol>

        {/* ── Card do simulado (direita) ── */}
        <div className="lg:self-start">
          {open ? (
            <div key={open.id} ref={wrapRef} className="relative motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:slide-in-from-left-3 duration-300 ease-out">
              {/* Ponta do balão apontando exatamente para o nó selecionado na trilha */}
              <span className="absolute -left-2 z-10 hidden h-0 w-0 border-y-[9px] border-r-[10px] border-y-transparent lg:block"
                style={{ top: tailTop - 9, borderRightColor: open.capa ? '#0e0e14' : `color-mix(in oklab, ${COR} 45%, #000)` }} />
              <div className="overflow-hidden rounded-2xl border shadow-xl transition-transform duration-200 hover:scale-[1.015]">
                <div className="relative aspect-[4/5]">
                  {open.capa
                    ? <img src={open.capa} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    : <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, color-mix(in oklab, ${COR} 45%, #000), #0b0b12)` }} />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/10" />

                  {open.estado === 'concluido' && open.nota != null && (
                    <div className="absolute right-3 top-3 text-right leading-none text-white drop-shadow">
                      <div className="text-2xl font-extrabold tabular-nums">{open.nota.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/70">Nota</div>
                    </div>
                  )}
                  {open.estado === 'atual' && <span className="absolute left-3 top-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">Comece aqui</span>}

                  <div className="absolute inset-x-0 bottom-0 space-y-2 p-4 text-white">
                    <div className="flex items-center gap-1.5 text-xs">
                      {open.estado === 'concluido' ? <><Check className="h-3.5 w-3.5" /> <span className="font-semibold uppercase tracking-wide">Concluído</span></>
                        : open.estado === 'bloqueado' ? <><Lock className="h-3.5 w-3.5" /> <span className="font-medium">Bloqueado</span></>
                        : <span className="inline-flex items-center gap-1 text-white/85"><Play className="h-3.5 w-3.5" /> Disponível</span>}
                    </div>
                    <div className="text-base font-bold leading-tight">{open.titulo}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/80">
                      {open.tentativas > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5"><Trophy className="h-3 w-3" /> {open.tentativas}x</span>}
                      {open.statusLabel && <span className="rounded-full bg-white/15 px-2 py-0.5">{open.statusLabel}</span>}
                      {gamAtivo && open.xp > 0 && open.estado !== 'concluido' && <span className="inline-flex items-center gap-1 rounded-full bg-primary/85 px-2 py-0.5 font-semibold"><Zap className="h-3 w-3" /> +{open.xp} XP</span>}
                    </div>
                    {open.href && open.estado !== 'bloqueado' && (
                      <Link href={open.href} className={cn('mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition',
                        open.estado === 'atual' ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-white/15 text-white hover:bg-white/25')}>
                        {open.estado === 'atual' ? <><Play className="h-4 w-4" /> {open.acao}</> : <>{open.acao} →</>}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[200px] items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">Selecione um simulado.</div>
          )}
        </div>
      </div>
    </section>
  )
}
