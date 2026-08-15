'use client'

import { useState } from 'react'
import { Trophy, Loader2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSWRGet } from '@/hooks/use-swr-get'

interface Item { estudanteId: string; nome: string; xp: number; posicao: number; eu: boolean; avatar?: string | null; avatarCor?: string | null }

function medalha(p: number) {
  if (p === 1) return 'text-amber-400'
  if (p === 2) return 'text-slate-400'
  if (p === 3) return 'text-orange-400'
  return 'text-muted-foreground'
}

/** Ranking da liga por XP total (sem temporada). Alterna entre a minha liga e o geral. */
export function LigaRankingFull({ corLiga }: { corLiga: string }) {
  const [ambito, setAmbito] = useState<'liga' | 'geral'>('liga')
  // SWR: ranking do cache NA HORA (ao remontar/trocar de aba já vista) + revalidação em 2º plano.
  const { data, carregando } = useSWRGet<{ itens?: Item[]; maxXp?: number }>(`/api/aluno/gamificacao/ranking?ambito=${ambito}`)
  const itens = data?.itens ?? []
  const maxXp = data?.maxXp ?? 0

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Trophy className="h-4 w-4 text-primary" /> Ranking</h3>
        <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
          {([['liga', 'Minha liga'], ['geral', 'Geral']] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setAmbito(v)}
              className={cn('rounded-md px-3 py-1 text-xs font-medium transition-colors', ambito === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : itens.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Ainda sem pontuação. Faça um simulado para entrar no ranking! 🚀</p>
      ) : (
        <ol className="space-y-1.5">
          {itens.map((it, i) => {
            const gap = i > 0 && it.posicao > itens[i - 1].posicao + 1
            const pct = maxXp > 0 ? Math.max(5, Math.round((it.xp / maxXp) * 100)) : 0
            return (
              <div key={it.estudanteId}>
                {gap && <li className="py-0.5 text-center text-muted-foreground/50" aria-hidden>⋯</li>}
                <li className={cn('flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors', !it.eu && 'hover:bg-muted/40')}
                  style={it.eu ? { background: `color-mix(in oklab, ${corLiga} 12%, transparent)`, boxShadow: `inset 0 0 0 1px ${corLiga}` } : undefined}>
                  <span className={cn('w-5 shrink-0 text-center text-sm font-bold tabular-nums', medalha(it.posicao))}>{it.posicao}</span>
                  <Avatar it={it} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                      <span className="truncate">{it.nome}</span>{it.eu && <span className="shrink-0 text-xs text-primary">(você)</span>}
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: it.eu ? corLiga : 'color-mix(in oklab, var(--muted-foreground) 42%, transparent)' }} />
                    </div>
                  </div>
                  <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">{it.xp.toLocaleString('pt-BR')} XP</span>
                </li>
              </div>
            )
          })}
        </ol>
      )}

      <p className="mt-4 flex items-center gap-1.5 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" /> Ranking {ambito === 'liga' ? 'da sua liga' : 'geral'} por XP total acumulado. Clique em um aluno para ver o perfil.
      </p>
    </div>
  )
}

function Avatar({ it }: { it: Item }) {
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold uppercase text-white', !it.avatarCor && 'bg-muted !text-foreground')}
      style={it.avatarCor ? { background: it.avatarCor } : undefined}>
      {it.avatar
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={it.avatar} alt="" className="h-full w-full object-contain object-[center_82%]" />
        : it.nome.slice(0, 1)}
    </span>
  )
}
