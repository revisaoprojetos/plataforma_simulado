'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Clock } from 'lucide-react'
import { BarraBusca, FiltroSelect, Vazio, Iniciais, Anel, corAcerto } from '@/components/admin/relatorios/lista-kit'

export type ResumoEstudante = { id: string; nome: string; simulados: number; notaMedia: number | null; ultima: string | null }

const nota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','))
const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')

export function EstudantesLista({ itens }: { itens: ResumoEstudante[] }) {
  const [q, setQ] = useState('')
  const [ordem, setOrdem] = useState('nota')
  const [filtro, setFiltro] = useState('todos')

  const lista = useMemo(() => {
    const termo = q.trim().toLowerCase()
    let r = itens.filter((e) => (!termo || e.nome.toLowerCase().includes(termo)) && (filtro === 'todos' || e.simulados > 0))
    r = [...r].sort((a, b) => {
      if (ordem === 'nome') return a.nome.localeCompare(b.nome)
      if (ordem === 'simulados') return b.simulados - a.simulados
      return (b.notaMedia ?? -1) - (a.notaMedia ?? -1)
    })
    return r
  }, [itens, q, ordem, filtro])

  return (
    <div className="space-y-4">
      <BarraBusca valor={q} onValor={setQ} placeholder="Buscar estudante pelo nome…">
        <FiltroSelect valor={filtro} onValor={setFiltro} opcoes={[
          { valor: 'todos', rotulo: 'Todos' },
          { valor: 'ativos', rotulo: 'Com atividade' },
        ]} />
        <FiltroSelect valor={ordem} onValor={setOrdem} opcoes={[
          { valor: 'nota', rotulo: 'Maior nota média' },
          { valor: 'simulados', rotulo: 'Mais simulados' },
          { valor: 'nome', rotulo: 'Ordem alfabética' },
        ]} />
      </BarraBusca>

      {lista.length === 0 ? (
        <Vazio>Nenhum estudante encontrado.</Vazio>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {lista.map((e) => {
            const pct = e.notaMedia != null ? Math.round(e.notaMedia * 10) : 0
            return (
              <Link key={e.id} href={`/admin/relatorios/estudantes?estudante=${e.id}`}
                className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition hover:border-primary/50 hover:shadow-sm">
                <Iniciais nome={e.nome} />
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-1 font-medium">{e.nome}</h3>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span><span className="font-medium text-foreground tabular-nums">{e.simulados}</span> simulados</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtData(e.ultima)}</span>
                  </div>
                </div>
                {e.notaMedia != null ? (
                  <Anel pct={pct} cor={corAcerto(pct)} tamanho={46}>{nota(e.notaMedia)}</Anel>
                ) : (
                  <span className="text-xs text-muted-foreground">sem nota</span>
                )}
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
