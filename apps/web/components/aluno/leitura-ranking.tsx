'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Trophy, Sparkles, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AvatarEstudante } from '@/components/aluno/avatar-estudante'
import type { RankingLeitura, RankingLeituraItem } from '@/lib/leitura/ranking'

const POR_PAG = 10
const iniciais = (n: string) => (n || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
type Campo = 'posicao' | 'aulas' | 'acertos'

/**
 * Ranking do módulo LegProc. `modo='admin'` mostra nome + e-mail e leva ao perfil do aluno; `modo='aluno'`
 * mostra só as iniciais (sem e-mail/sem link). Ambos: fotos de perfil, ordenação (posição/aulas/acertos)
 * e paginação (10/pág).
 */
export function LeituraRanking({ ranking, meuId, modo = 'aluno' }: { ranking: RankingLeitura; meuId?: string | null; modo?: 'admin' | 'aluno' }) {
  const { itens, gamAtivo } = ranking
  const rotulo = gamAtivo ? 'Pontos' : 'Acertos'
  const [campo, setCampo] = useState<Campo>('posicao')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [pagina, setPagina] = useState(1)

  const ordenados = useMemo(() => {
    const arr = [...itens]
    arr.sort((a, b) => {
      const c = campo === 'posicao' ? a.posicao - b.posicao : campo === 'aulas' ? a.aulasConcluidas - b.aulasConcluidas : a.score - b.score
      return dir === 'asc' ? c : -c
    })
    return arr
  }, [itens, campo, dir])

  function ordenar(c: Campo) {
    if (campo === c) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setCampo(c); setDir(c === 'posicao' ? 'asc' : 'desc') }
    setPagina(1)
  }

  if (!itens.length) {
    return (
      <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
        <Trophy className="mx-auto mb-2 h-8 w-8 opacity-40" />
        Ainda não há ranking neste módulo. {modo === 'admin' ? 'Os alunos precisam responder o quiz das aulas.' : 'Responda o quiz das aulas para pontuar.'}
      </div>
    )
  }

  const top3 = itens.slice(0, 3)
  const ordemPodio = [top3[1], top3[0], top3[2]].filter(Boolean) // 2º · 1º · 3º
  const medalha = ['#facc15', '#cbd5e1', '#f59e0b']

  const totalPag = Math.max(1, Math.ceil(ordenados.length / POR_PAG))
  const pag = Math.min(pagina, totalPag)
  const visiveis = ordenados.slice((pag - 1) * POR_PAG, pag * POR_PAG)

  const Th = ({ c, children, className }: { c: Campo; children: ReactNode; className?: string }) => (
    <th className={cn('px-3 py-2.5 font-medium', className)}>
      <button type="button" onClick={() => ordenar(c)} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}<ArrowUpDown className={cn('h-3 w-3', campo === c ? 'text-primary' : 'text-muted-foreground/50')} />
      </button>
    </th>
  )

  return (
    <div className="space-y-4">
      {/* Pódio (top 3 por posição) */}
      {top3.length >= 3 && (
        <div className="grid grid-cols-3 items-end gap-3">
          {ordemPodio.map((it) => {
            const eu = !!meuId && it.estudanteId === meuId
            return (
              <div key={it.estudanteId} className={cn('flex flex-col items-center rounded-2xl border bg-card p-3 text-center shadow-sm', it.posicao === 1 ? 'pt-2' : 'pt-6', eu && 'border-primary/50 bg-primary/5')}>
                <span className="relative">
                  <AvatarEstudante nome={it.nome} avatar={it.avatar} cor={it.avatarCor ?? '#6d28d9'} className={cn('text-white ring-2 ring-offset-2 ring-offset-card', it.posicao === 1 ? 'h-14 w-14 text-base' : 'h-11 w-11 text-sm')} />
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black text-black shadow" style={{ background: medalha[it.posicao - 1] }}>{it.posicao}</span>
                </span>
                <span className="mt-2 line-clamp-1 text-sm font-semibold">{modo === 'aluno' ? (eu ? 'Você' : iniciais(it.nome)) : it.nome}</span>
                <span className="text-xs font-bold tabular-nums text-primary">{it.score} {rotulo.toLowerCase()}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-muted-foreground">
            <tr>
              <Th c="posicao" className="w-14 text-center">#</Th>
              <th className="px-3 py-2.5 font-medium">Aluno</th>
              <Th c="aulas" className="w-24 text-right justify-end">Aulas</Th>
              <Th c="acertos" className="w-24 text-right justify-end">{rotulo}</Th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((it) => <LinhaRanking key={it.estudanteId} it={it} eu={!!meuId && it.estudanteId === meuId} modo={modo} />)}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPag > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Página {pag} de {totalPag} · {ordenados.length} alunos</span>
          <div className="flex gap-1.5">
            <button onClick={() => setPagina(1)} disabled={pag <= 1} className="rounded-lg border px-2.5 py-1 hover:bg-muted disabled:opacity-40">Início</button>
            <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pag <= 1} className="rounded-lg border px-2.5 py-1 hover:bg-muted disabled:opacity-40">Anterior</button>
            <button onClick={() => setPagina((p) => Math.min(totalPag, p + 1))} disabled={pag >= totalPag} className="rounded-lg border px-2.5 py-1 hover:bg-muted disabled:opacity-40">Próxima</button>
            <button onClick={() => setPagina(totalPag)} disabled={pag >= totalPag} className="rounded-lg border px-2.5 py-1 hover:bg-muted disabled:opacity-40">Final</button>
          </div>
        </div>
      )}

      {gamAtivo && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-amber-500" /> Pontuação da gamificação ativa — aulas, acertos e combos de gabarito.</p>
      )}
    </div>
  )
}

function LinhaRanking({ it, eu, modo }: { it: RankingLeituraItem; eu: boolean; modo: 'admin' | 'aluno' }) {
  const avatar = <AvatarEstudante nome={it.nome} avatar={it.avatar} cor={it.avatarCor ?? '#6d28d9'} className="h-9 w-9 shrink-0 text-[11px] text-white" />
  const identidade = modo === 'admin' ? (
    <Link href={`/admin/estudantes/${it.estudanteId}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
      {avatar}
      <span className="min-w-0">
        <span className="block truncate font-medium">{it.nome}</span>
        {it.email && <span className="block truncate text-xs text-muted-foreground">{it.email}</span>}
      </span>
    </Link>
  ) : (
    <div className="flex min-w-0 items-center gap-2.5">
      {avatar}
      <span className={cn('truncate font-medium', eu && 'text-primary')}>{eu ? 'Você' : iniciais(it.nome)}</span>
    </div>
  )
  return (
    <tr className={cn('border-b last:border-0', eu ? 'bg-primary/5' : 'hover:bg-muted/30')}>
      <td className="px-3 py-2.5 text-center font-bold tabular-nums text-muted-foreground">{it.posicao}</td>
      <td className="px-3 py-2.5">{identidade}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{it.aulasConcluidas}</td>
      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{it.score}</td>
    </tr>
  )
}
