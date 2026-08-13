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

export function TrilhaSimulados({ trilhas, gamAtivo }: { trilhas: Trilha[]; gamAtivo: boolean }) {
  const [ativa, setAtiva] = useState(trilhas[0]?.id)
  const t = trilhas.find((x) => x.id === ativa) ?? trilhas[0]
  if (!t) return null
  const pct = t.total ? Math.round((t.done / t.total) * 100) : 0

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight"><Route className="h-5 w-5 text-primary" /> Trilhas de simulados</h2>
        <p className="text-sm text-muted-foreground">Cada grupo tem sua própria trilha — conclua um simulado para desbloquear o próximo.</p>
      </div>

      {/* Tabs de trilhas */}
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

      {/* Progresso da trilha */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span><span className="font-medium text-foreground">{t.nome}</span> · {t.done}/{t.total} concluídos</span>
          {gamAtivo && t.trilhaXp > 0 && <span className="inline-flex items-center gap-1">recompensa da trilha: <span className="font-semibold text-primary">+{t.trilhaXp} XP</span></span>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Timeline */}
      <ol className="relative space-y-3">
        {t.nodes.map((n, i) => {
          const cor = t.cor || 'var(--primary)'
          const concluido = n.estado === 'concluido'
          const atual = n.estado === 'atual'
          const bloqueado = n.estado === 'bloqueado'
          return (
            <li key={n.id} className="relative flex gap-4">
              {/* Rail + nó */}
              <div className="flex flex-col items-center">
                <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  concluido && 'text-white', atual && 'ring-4', bloqueado && 'bg-muted text-muted-foreground/50')}
                  style={concluido ? { background: cor, borderColor: cor }
                    : atual ? { background: `color-mix(in oklab, ${cor} 15%, transparent)`, borderColor: cor, color: cor, boxShadow: `0 0 0 4px color-mix(in oklab, ${cor} 20%, transparent)` }
                    : { borderColor: 'var(--border)' }}>
                  {concluido ? <Check className="h-5 w-5" /> : atual ? <Star className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                </span>
                {i < t.nodes.length - 1 && <span className="my-1 w-0.5 flex-1 rounded-full" style={{ background: concluido ? cor : 'var(--border)', minHeight: 28 }} />}
              </div>

              {/* Card */}
              <div className={cn('mb-1 flex-1 rounded-2xl border p-4 shadow-sm transition-colors', atual ? 'bg-card' : 'bg-card/60', bloqueado && 'opacity-70')}
                style={atual ? { borderColor: `color-mix(in oklab, ${cor} 45%, transparent)` } : undefined}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {atual && <span className="mb-1 inline-block rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Comece aqui</span>}
                    <div className="font-semibold">{n.titulo}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {concluido ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Concluído</span>
                          {n.acerto != null && <span className="inline-flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> {n.acerto}% de acerto</span>}
                        </>
                      ) : bloqueado ? (
                        <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Desbloqueie concluindo o anterior</span>
                      ) : (
                        n.quando && <span>{n.quando}</span>
                      )}
                    </div>
                  </div>
                  {gamAtivo && n.xp > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"><Zap className="h-3.5 w-3.5" /> +{n.xp} XP</span>
                  )}
                </div>

                {atual && n.href && (
                  <Link href={n.href} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90">
                    <Play className="h-4 w-4" /> {n.acao}
                  </Link>
                )}
                {concluido && n.href && (
                  <Link href={n.href} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-muted">
                    {n.acao}
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
