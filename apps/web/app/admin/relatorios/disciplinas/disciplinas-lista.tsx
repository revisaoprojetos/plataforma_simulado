'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Layers, ArrowRight } from 'lucide-react'
import { BarraBusca, FiltroSelect, Vazio } from '@/components/admin/relatorios/lista-kit'

export type ResumoDisciplina = { id: string; nome: string; questoes: number; assuntos: number }

const TONS = [
  { bg: 'from-blue-500/15 to-blue-500/5', bar: 'bg-blue-500', ic: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  { bg: 'from-violet-500/15 to-violet-500/5', bar: 'bg-violet-500', ic: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  { bg: 'from-emerald-500/15 to-emerald-500/5', bar: 'bg-emerald-500', ic: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  { bg: 'from-rose-500/15 to-rose-500/5', bar: 'bg-rose-500', ic: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  { bg: 'from-amber-500/15 to-amber-500/5', bar: 'bg-amber-500', ic: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  { bg: 'from-cyan-500/15 to-cyan-500/5', bar: 'bg-cyan-500', ic: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' },
]

export function DisciplinasLista({ itens }: { itens: ResumoDisciplina[] }) {
  const [q, setQ] = useState('')
  const [ordem, setOrdem] = useState('questoes')
  const maxQ = useMemo(() => Math.max(1, ...itens.map((d) => d.questoes)), [itens])

  const lista = useMemo(() => {
    const termo = q.trim().toLowerCase()
    return itens
      .filter((d) => !termo || d.nome.toLowerCase().includes(termo))
      .sort((a, b) => (ordem === 'nome' ? a.nome.localeCompare(b.nome) : b.questoes - a.questoes))
  }, [itens, q, ordem])

  return (
    <div className="space-y-4">
      <BarraBusca valor={q} onValor={setQ} placeholder="Buscar disciplina…">
        <FiltroSelect valor={ordem} onValor={setOrdem} opcoes={[
          { valor: 'questoes', rotulo: 'Mais questões' },
          { valor: 'nome', rotulo: 'Ordem alfabética' },
        ]} />
      </BarraBusca>

      {lista.length === 0 ? (
        <Vazio>Nenhuma disciplina encontrada.</Vazio>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((d, i) => {
            const t = TONS[i % TONS.length]
            const pct = Math.round((d.questoes / maxQ) * 100)
            return (
              <Link key={d.id} href={`/admin/relatorios/disciplinas?disciplina=${d.id}`}
                className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${t.bg} p-4 transition hover:shadow-md`}>
                <div className="mb-3 flex items-start justify-between">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.ic}`}><BookOpen className="h-5 w-5" /></span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </div>
                <h3 className="line-clamp-2 min-h-[2.5rem] font-semibold leading-snug">{d.nome}</h3>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground tabular-nums">{d.questoes}</span> questões
                  <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> {d.assuntos} assuntos</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${pct}%` }} />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
