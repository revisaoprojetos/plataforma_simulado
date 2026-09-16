import { Trophy, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AvatarEstudante } from '@/components/aluno/avatar-estudante'
import type { RankingLeitura } from '@/lib/leitura/ranking'

/** Ranking do módulo LegProc (iniciais dos alunos) por acertos no quiz (ou pontos, com gamificação). */
export function LeituraRanking({ ranking, meuId }: { ranking: RankingLeitura; meuId?: string | null }) {
  const { itens, gamAtivo } = ranking
  const rotulo = gamAtivo ? 'Pontos' : 'Acertos'
  if (!itens.length) {
    return (
      <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
        <Trophy className="mx-auto mb-2 h-8 w-8 opacity-40" />
        Ainda não há ranking neste módulo. Responda o quiz das aulas para pontuar.
      </div>
    )
  }
  const top3 = itens.slice(0, 3)
  const ordemPodio = [top3[1], top3[0], top3[2]].filter(Boolean) // 2º · 1º · 3º
  const medalha = ['#facc15', '#cbd5e1', '#f59e0b'] // ouro/prata/bronze (por posição 1..3)

  return (
    <div className="space-y-4">
      {/* Pódio (top 3) */}
      {top3.length >= 3 && (
        <div className="grid grid-cols-3 items-end gap-3">
          {ordemPodio.map((it) => {
            const eu = meuId && it.estudanteId === meuId
            const alt = it.posicao === 1 ? 'pt-2' : 'pt-6'
            return (
              <div key={it.estudanteId} className={cn('flex flex-col items-center rounded-2xl border bg-card p-3 text-center shadow-sm', alt, eu && 'border-primary/50 bg-primary/5')}>
                <span className="relative">
                  <AvatarEstudante nome={it.nome} cor={it.avatarCor ?? '#6d28d9'} className={cn('text-white ring-2 ring-offset-2 ring-offset-card', it.posicao === 1 ? 'h-14 w-14 text-base' : 'h-11 w-11 text-sm')} />
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black text-black shadow" style={{ background: medalha[it.posicao - 1] }}>{it.posicao}</span>
                </span>
                <span className="mt-2 line-clamp-1 text-sm font-semibold">{it.nome}{eu ? ' (você)' : ''}</span>
                <span className="text-xs font-bold tabular-nums text-primary">{it.score} {rotulo.toLowerCase()}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Tabela completa */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-muted-foreground">
            <tr>
              <th className="w-12 px-3 py-2.5 text-center font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">Aluno</th>
              <th className="px-3 py-2.5 text-right font-medium">Aulas</th>
              <th className="px-3 py-2.5 text-right font-medium">{rotulo}</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it) => {
              const eu = meuId && it.estudanteId === meuId
              return (
                <tr key={it.estudanteId} className={cn('border-b last:border-0', eu ? 'bg-primary/5' : 'hover:bg-muted/30')}>
                  <td className="px-3 py-2.5 text-center font-bold tabular-nums text-muted-foreground">{it.posicao}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <AvatarEstudante nome={it.nome} cor={it.avatarCor ?? '#6d28d9'} className="h-8 w-8 text-[11px] text-white" />
                      <span className={cn('truncate font-medium', eu && 'text-primary')}>{it.nome}{eu ? ' (você)' : ''}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{it.aulasConcluidas}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{it.score}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {gamAtivo && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-amber-500" /> Pontuação da gamificação ativa — aulas, acertos e combos de gabarito.</p>
      )}
    </div>
  )
}
