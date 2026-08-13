'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Check, Lock, Play, Star, Route, Zap, Trophy } from 'lucide-react'

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

const SP = 104          // espaçamento vertical entre nós
const R = 28            // raio do nó
const XS = [46, 92]     // x alternado (serpenteado) dentro da coluna do caminho
const WPATH = 138       // largura da coluna do caminho

export function TrilhaSimulados({ trilhas, gamAtivo }: { trilhas: Trilha[]; gamAtivo: boolean }) {
  const [ativa, setAtiva] = useState(trilhas[0]?.id)
  const t = trilhas.find((x) => x.id === ativa) ?? trilhas[0]
  const atualId = t?.nodes.find((n) => n.estado === 'atual')?.id ?? t?.nodes[0]?.id ?? null
  const [aberto, setAberto] = useState<string | null>(atualId)
  if (!t) return null
  const pct = t.total ? Math.round((t.done / t.total) * 100) : 0
  // Mesma cor primária do botão "Fazer agora" (não a cor do grupo), p/ consistência visual.
  const cor = 'var(--brand-primary, var(--primary))'

  function trocar(id: string) {
    setAtiva(id)
    const tr = trilhas.find((x) => x.id === id)
    setAberto(tr?.nodes.find((n) => n.estado === 'atual')?.id ?? tr?.nodes[0]?.id ?? null)
  }

  // Posições dos nós (serpenteado) + nó do troféu no fim.
  const pts = t.nodes.map((_, i) => ({ x: XS[i % 2], y: 24 + i * SP }))
  const troyY = 24 + t.nodes.length * SP
  const troyX = XS[t.nodes.length % 2]
  const H = troyY + R + 16
  const openIdx = t.nodes.findIndex((n) => n.id === aberto)
  const openNode = openIdx >= 0 ? t.nodes[openIdx] : null

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight"><Route className="h-5 w-5 text-primary" /> Trilhas de simulados</h2>
        <p className="text-sm text-muted-foreground">Complete um simulado para desbloquear o próximo.</p>
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
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: cor }} />
        </div>
      </div>

      <div className="flex gap-4 rounded-2xl border bg-gradient-to-br from-muted/20 to-transparent p-4">
        {/* Caminho (esquerda) */}
        <div className="relative shrink-0" style={{ width: WPATH, height: H }}>
          <svg className="absolute inset-0 h-full w-full" style={{ overflow: 'visible' }} aria-hidden>
            {pts.map((p, i) => {
              const next = i < pts.length - 1 ? pts[i + 1] : { x: troyX, y: troyY }
              const done = t.nodes[i].estado === 'concluido'
              return <line key={i} x1={p.x} y1={p.y} x2={next.x} y2={next.y} stroke={done ? cor : 'var(--border)'} strokeWidth={5} strokeLinecap="round" />
            })}
          </svg>

          {t.nodes.map((n, i) => {
            const p = pts[i]
            const concluido = n.estado === 'concluido'
            const atual = n.estado === 'atual'
            const bloqueado = n.estado === 'bloqueado'
            const sel = n.id === aberto
            return (
              <button key={n.id} type="button" onClick={() => setAberto(n.id)} aria-label={n.titulo}
                className={cn('absolute flex items-center justify-center rounded-full border-4 shadow-md transition-transform hover:scale-105 focus:outline-none',
                  sel && 'animate-bounce', bloqueado && 'bg-muted text-muted-foreground/50', sel && 'ring-4 ring-primary/30')}
                style={{ width: R * 2, height: R * 2, left: p.x - R, top: p.y - R,
                  ...(concluido ? { background: cor, borderColor: `color-mix(in oklab, ${cor} 70%, #000)`, color: '#fff' }
                    : atual ? { background: `color-mix(in oklab, ${cor} 18%, var(--card))`, borderColor: cor, color: cor }
                    : { borderColor: 'var(--border)' }) }}>
                {concluido ? <Check className="h-7 w-7" /> : atual ? <Star className="h-7 w-7" /> : <Lock className="h-6 w-6" />}
              </button>
            )
          })}

          {/* Troféu final */}
          <span className="absolute flex items-center justify-center rounded-full border-4"
            style={{ width: 52, height: 52, left: troyX - 26, top: troyY - 26,
              ...(t.done >= t.total ? { background: 'var(--brand-accent, #f59e0b)', borderColor: 'color-mix(in oklab, var(--brand-accent, #f59e0b) 70%, #000)', color: '#fff' } : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }) }}>
            <Trophy className="h-6 w-6" />
          </span>
        </div>

        {/* Card poster do simulado (direita) — balão apontando para o nó + animação de entrada */}
        <div className="relative min-w-0 flex-1" style={{ minHeight: H }}>
          {openNode ? (
            <div key={openNode.id} className="absolute left-3 w-full max-w-[280px] animate-in fade-in zoom-in-95 slide-in-from-left-3 duration-300 ease-out"
              style={{ top: Math.max(0, Math.min((pts[openIdx]?.y ?? 24) - 44, Math.max(0, H - 350))) }}>
              {/* Ponta do balão apontando para a trilha */}
              <span className="absolute -left-2 top-10 z-10 h-0 w-0 border-y-[9px] border-r-[10px] border-y-transparent"
                style={{ borderRightColor: openNode.capa ? '#0e0e14' : `color-mix(in oklab, ${cor} 45%, #000)` }} />
              <div className="overflow-hidden rounded-2xl border shadow-xl transition-transform duration-200 hover:scale-[1.02]">
              <div className="relative aspect-[4/5]">
                {openNode.capa
                  ? <img src={openNode.capa} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  : <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, color-mix(in oklab, ${cor} 45%, #000), #0b0b12)` }} />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/10" />

                {/* Nota (concluído) */}
                {openNode.estado === 'concluido' && openNode.nota != null && (
                  <div className="absolute right-3 top-3 text-right leading-none text-white drop-shadow">
                    <div className="text-2xl font-extrabold tabular-nums">{openNode.nota.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-white/70">Nota</div>
                  </div>
                )}
                {openNode.estado === 'atual' && (
                  <span className="absolute left-3 top-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">Comece aqui</span>
                )}

                {/* Rodapé */}
                <div className="absolute inset-x-0 bottom-0 space-y-2 p-4 text-white">
                  <div className="flex items-center gap-1.5 text-xs">
                    {openNode.estado === 'concluido' ? <><Check className="h-3.5 w-3.5" /> <span className="font-semibold uppercase tracking-wide">Concluído</span></>
                      : openNode.estado === 'bloqueado' ? <><Lock className="h-3.5 w-3.5" /> <span className="font-medium">Bloqueado</span></>
                      : <span className="inline-flex items-center gap-1 text-white/80"><Play className="h-3.5 w-3.5" /> Disponível</span>}
                  </div>
                  <div className="text-base font-bold leading-tight">{openNode.titulo}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/80">
                    {openNode.tentativas > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5"><Trophy className="h-3 w-3" /> {openNode.tentativas}x</span>}
                    {openNode.statusLabel && <span className="rounded-full bg-white/15 px-2 py-0.5">{openNode.statusLabel}</span>}
                    {gamAtivo && openNode.xp > 0 && openNode.estado !== 'concluido' && <span className="inline-flex items-center gap-1 rounded-full bg-primary/80 px-2 py-0.5 font-semibold"><Zap className="h-3 w-3" /> +{openNode.xp} XP</span>}
                  </div>
                  {openNode.href && openNode.estado !== 'bloqueado' && (
                    <Link href={openNode.href} className={cn('mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition',
                      openNode.estado === 'atual' ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-white/15 text-white hover:bg-white/25')}>
                      {openNode.estado === 'atual' ? <><Play className="h-4 w-4" /> {openNode.acao}</> : <>{openNode.acao} →</>}
                    </Link>
                  )}
                </div>
              </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Selecione um simulado na trilha.</div>
          )}
        </div>
      </div>
    </section>
  )
}
