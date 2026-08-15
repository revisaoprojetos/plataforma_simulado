'use client'

import { useState } from 'react'
import { Trophy, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSWRGet } from '@/hooks/use-swr-get'

interface RankingItem { estudanteId: string; nome: string; xp: number; posicao: number; eu: boolean; avatar?: string | null; avatarCor?: string | null }
type Escopo = 'total' | 'semana' | 'mes'

const ABAS: { id: Escopo; label: string }[] = [
  { id: 'total', label: 'Minha liga' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
]

function medalha(p: number) {
  if (p === 1) return 'text-amber-400'
  if (p === 2) return 'text-slate-300'
  if (p === 3) return 'text-orange-400'
  return 'text-muted-foreground'
}

/** Leaderboard com alternância entre liga (XP total) e período (semana/mês). Busca sob demanda. */
export function RankingLiga({ inicial = 'total' }: { inicial?: Escopo }) {
  const [escopo, setEscopo] = useState<Escopo>(inicial)
  // SWR: mostra o ranking do cache NA HORA (ao remontar ou trocar p/ uma aba já vista) e revalida atrás.
  const { data, carregando } = useSWRGet<{ itens?: RankingItem[] }>(`/api/aluno/gamificacao/ranking?escopo=${escopo}`)
  const itens = data?.itens ?? []

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Trophy className="h-4 w-4 text-primary" /> Ranking</h3>
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          {ABAS.map((a) => (
            <button key={a.id} type="button" onClick={() => setEscopo(a.id)}
              className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', escopo === a.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : itens.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Ainda sem pontuação neste período. Faça um simulado para entrar no ranking! 🚀</p>
      ) : (
        <ol className="space-y-1">
          {itens.map((it, i) => {
            const gap = i > 0 && it.posicao > itens[i - 1].posicao + 1 // salto (top 9 → você)
            return (
              <div key={it.estudanteId}>
                {gap && <li className="flex justify-center py-0.5 text-muted-foreground/60" aria-hidden>⋯</li>}
                <li className={cn('flex items-center gap-3 rounded-lg px-2.5 py-2', it.eu && 'bg-primary/10 ring-1 ring-primary/30')}>
                  <span className={cn('w-6 shrink-0 text-center text-sm font-bold tabular-nums', medalha(it.posicao))}>{it.posicao}</span>
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold uppercase', !it.avatarCor && 'bg-muted')} style={it.avatarCor ? { background: it.avatarCor } : undefined}>
                    {it.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.avatar} alt="" className="h-full w-full object-contain object-[center_82%]" />
                    ) : it.nome.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{it.nome}{it.eu && <span className="ml-1 text-xs text-primary">(você)</span>}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{it.xp.toLocaleString('pt-BR')} XP</span>
                </li>
              </div>
            )
          })}
        </ol>
      )}
    </div>
  )
}
