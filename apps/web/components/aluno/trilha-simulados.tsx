'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Check, Lock, Play, Star, Route, Zap, Trophy, CircleCheck } from 'lucide-react'

export interface TrilhaNode {
  id: string
  titulo: string
  quando: string | null
  estado: 'concluido' | 'atual' | 'bloqueado'
  acerto: number | null
  nota: number | null
  tentativas: number
  statusLabel: string
  questoes: number
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
  if (!t) return null
  const pct = t.total ? Math.round((t.done / t.total) * 100) : 0
  const rolar = t.nodes.length > 5

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight"><Route className="h-5 w-5 text-primary" /> Trilhas de simulados</h2>
        <p className="text-sm text-muted-foreground">Conclua um simulado para desbloquear o próximo.</p>
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

      {/* Timeline: círculo + linha à esquerda, card do simulado à direita. Máx. 5 visíveis + rolagem. */}
      <div className="relative">
        <ol className={cn('min-w-0 space-y-0', rolar && 'max-h-[34rem] overflow-y-auto pr-1 [scrollbar-width:thin]')}>
          {t.nodes.map((n, i) => {
            const concluido = n.estado === 'concluido'
            const atual = n.estado === 'atual'
            const bloqueado = n.estado === 'bloqueado'
            const meta = [n.quando, n.questoes > 0 ? `${n.questoes} questões` : null].filter(Boolean).join(' · ')
            return (
              <li key={n.id} className="flex gap-4">
                {/* Nó + conector */}
                <div className="flex flex-col items-center pt-3">
                  <span className={cn('relative flex shrink-0 items-center justify-center rounded-full border-4 shadow-sm', bloqueado && 'bg-muted text-muted-foreground/50')}
                    style={{ width: 52, height: 52, ...(concluido ? { background: COR, borderColor: `color-mix(in oklab, ${COR} 70%, #000)`, color: '#fff' }
                      : atual ? { background: `color-mix(in oklab, ${COR} 16%, var(--card))`, borderColor: COR, color: COR }
                      : { borderColor: 'var(--border)' }) }}>
                    {atual && <span className="pointer-events-none absolute inset-[-5px] rounded-full border-2 opacity-60 motion-safe:animate-ping" style={{ borderColor: COR }} />}
                    {concluido ? <Check className="h-6 w-6" /> : atual ? <Star className="h-6 w-6" /> : <Lock className="h-5 w-5" />}
                  </span>
                  {i < t.nodes.length - 1 && <span className="my-1 w-1 flex-1 rounded-full" style={{ minHeight: 24, background: concluido ? COR : 'var(--border)' }} />}
                </div>

                {/* Card do simulado */}
                <div className={cn('mb-4 flex-1 rounded-2xl border p-4 text-center shadow-sm transition-colors',
                  atual ? 'bg-card' : 'bg-muted/25', bloqueado && 'opacity-75')}
                  style={atual ? { borderColor: `color-mix(in oklab, ${COR} 40%, transparent)` } : undefined}>
                  {atual && <span className="mb-1.5 inline-block rounded-full border border-primary/50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Comece aqui</span>}

                  <div className="font-semibold leading-snug">{n.titulo}</div>

                  <div className="mt-1 text-xs text-muted-foreground">
                    {concluido ? <span className="inline-flex items-center gap-1"><CircleCheck className="h-3.5 w-3.5" /> Concluído</span>
                      : bloqueado ? <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Desbloqueie concluindo o anterior</span>
                      : (meta || 'Disponível')}
                  </div>

                  {concluido && n.acerto != null && (
                    <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary"><CircleCheck className="h-4 w-4" /> {n.acerto}% de acerto</div>
                  )}

                  {gamAtivo && n.xp > 0 && !concluido && (
                    <div className="mt-2"><span className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-2.5 py-1 text-xs font-semibold text-primary"><Zap className="h-3.5 w-3.5" /> +{n.xp} XP</span></div>
                  )}

                  {n.href && atual && (
                    <div className="mt-3">
                      <Link href={n.href} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/50 px-5 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10">
                        <Play className="h-4 w-4" /> {n.acao}
                      </Link>
                    </div>
                  )}
                  {n.href && concluido && (
                    <div className="mt-2"><Link href={n.href} className="text-xs font-medium text-muted-foreground transition hover:text-foreground">Ver resultado →</Link></div>
                  )}
                </div>
              </li>
            )
          })}

          {/* Troféu final */}
          <li className="flex items-center gap-4">
            <div className="flex w-[52px] justify-center">
              <span className="flex items-center justify-center rounded-full border-4" style={{ width: 48, height: 48, ...(t.done >= t.total ? { background: 'var(--brand-accent, #f59e0b)', borderColor: 'color-mix(in oklab, var(--brand-accent, #f59e0b) 70%, #000)', color: '#fff' } : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }) }}>
                <Trophy className="h-5 w-5" />
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{t.done >= t.total ? 'Trilha concluída! 🎉' : `Conclua os ${t.total} para o troféu da trilha.`}</span>
          </li>
        </ol>
        {rolar && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-2xl bg-gradient-to-t from-background to-transparent" />}
      </div>
    </section>
  )
}
