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
  xp: number
  href: string | null
  acao: string
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

// Deslocamento horizontal dos nós — dá o serpenteado estilo Duolingo.
const OFF = [0, 54, 82, 54, 0, -54, -82, -54]

export function TrilhaSimulados({ trilhas, gamAtivo }: { trilhas: Trilha[]; gamAtivo: boolean }) {
  const [ativa, setAtiva] = useState(trilhas[0]?.id)
  const t = trilhas.find((x) => x.id === ativa) ?? trilhas[0]
  const atualId = t?.nodes.find((n) => n.estado === 'atual')?.id ?? null
  const [aberto, setAberto] = useState<string | null>(atualId)
  if (!t) return null
  const pct = t.total ? Math.round((t.done / t.total) * 100) : 0
  const cor = t.cor || 'var(--brand-primary, var(--primary))'

  // Ao trocar de trilha, reabre o nó atual dela.
  function trocar(id: string) {
    setAtiva(id)
    const tr = trilhas.find((x) => x.id === id)
    setAberto(tr?.nodes.find((n) => n.estado === 'atual')?.id ?? null)
  }

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

      {/* Caminho serpenteado */}
      <div className="relative rounded-2xl border bg-gradient-to-b from-muted/20 to-transparent py-6">
        <div className="pointer-events-none absolute left-1/2 top-6 bottom-6 w-1 -translate-x-1/2 rounded-full bg-border/60" />
        <div className="relative flex flex-col items-center gap-6">
          {t.nodes.map((n, i) => {
            const concluido = n.estado === 'concluido'
            const atual = n.estado === 'atual'
            const bloqueado = n.estado === 'bloqueado'
            const off = OFF[i % OFF.length]
            const open = aberto === n.id
            return (
              <div key={n.id} className="flex w-full flex-col items-center" style={{ transform: `translateX(${off}px)` }}>
                <button type="button" onClick={() => setAberto(open ? null : n.id)} aria-label={n.titulo}
                  className={cn('relative flex h-16 w-16 items-center justify-center rounded-full border-4 shadow-md transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    atual && 'animate-bounce', bloqueado && 'bg-muted text-muted-foreground/50')}
                  style={concluido ? { background: cor, borderColor: `color-mix(in oklab, ${cor} 70%, #000)`, color: '#fff' }
                    : atual ? { background: `color-mix(in oklab, ${cor} 18%, var(--card))`, borderColor: cor, color: cor }
                    : { borderColor: 'var(--border)' }}>
                  {concluido ? <Check className="h-7 w-7" /> : atual ? <Star className="h-7 w-7" /> : <Lock className="h-6 w-6" />}
                </button>

                {/* Popup do nó */}
                {open && (
                  <div className="relative z-10 mt-3 w-full max-w-xs" style={{ transform: `translateX(${-off}px)` }}>
                    <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t bg-card" style={{ marginLeft: off }} />
                    <div className="rounded-2xl border bg-card p-4 text-center shadow-lg" style={atual ? { borderColor: `color-mix(in oklab, ${cor} 45%, transparent)` } : undefined}>
                      {atual && <span className="mb-1 inline-block rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Comece aqui</span>}
                      <div className="font-semibold">{n.titulo}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {concluido ? <>Concluído{n.acerto != null ? ` · ${n.acerto}% de acerto` : ''}</>
                          : bloqueado ? 'Desbloqueie concluindo o anterior'
                          : (n.quando ?? 'Disponível')}
                      </div>
                      {n.href && !bloqueado && (
                        <Link href={n.href} className={cn('mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition',
                          atual ? 'w-full bg-primary text-primary-foreground hover:opacity-90' : 'border hover:bg-muted')}>
                          {atual && <Play className="h-4 w-4" />}{n.acao}{gamAtivo && atual && n.xp > 0 ? ` · +${n.xp} XP` : ''}
                        </Link>
                      )}
                      {bloqueado && gamAtivo && n.xp > 0 && (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"><Zap className="h-3.5 w-3.5" /> +{n.xp} XP</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {/* Troféu final da trilha */}
          <div className="flex flex-col items-center" style={{ transform: `translateX(${OFF[t.nodes.length % OFF.length]}px)` }}>
            <span className={cn('flex h-14 w-14 items-center justify-center rounded-full border-4', t.done >= t.total ? 'text-white' : 'bg-muted text-muted-foreground/50')}
              style={t.done >= t.total ? { background: 'var(--brand-accent, #f59e0b)', borderColor: 'color-mix(in oklab, var(--brand-accent, #f59e0b) 70%, #000)' } : { borderColor: 'var(--border)' }}>
              <Trophy className="h-6 w-6" />
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
