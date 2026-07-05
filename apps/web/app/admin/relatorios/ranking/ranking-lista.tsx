'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Trophy, Users, Medal, ArrowRight } from 'lucide-react'
import { BarraBusca, FiltroSelect, Vazio } from '@/components/admin/relatorios/lista-kit'
import { TipoSimuladoBadge } from '@/components/admin/tipo-simulado-badge'
import type { ResumoSimulado } from '../_resumos'

export function RankingLista({ itens }: { itens: ResumoSimulado[] }) {
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('todos')

  const lista = useMemo(() => {
    const termo = q.trim().toLowerCase()
    return itens
      .filter((s) => (!termo || s.titulo.toLowerCase().includes(termo)) && (tipo === 'todos' || s.tipo === tipo))
      .sort((a, b) => b.participantes - a.participantes)
  }, [itens, q, tipo])

  return (
    <div className="space-y-4">
      <BarraBusca valor={q} onValor={setQ} placeholder="Buscar simulado para ver o ranking…">
        <FiltroSelect valor={tipo} onValor={setTipo} opcoes={[
          { valor: 'todos', rotulo: 'Todos os tipos' },
          { valor: 'objetiva', rotulo: 'Objetiva' },
          { valor: 'discursiva', rotulo: 'Discursiva' },
          { valor: 'mista', rotulo: 'Mista' },
        ]} />
      </BarraBusca>

      {lista.length === 0 ? (
        <Vazio>Nenhum simulado encontrado.</Vazio>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((s) => (
            <Link key={s.id} href={`/admin/relatorios/ranking?simulado=${s.id}`}
              className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border bg-card p-4 transition hover:border-amber-400/60 hover:shadow-md">
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-amber-400/10 blur-xl transition group-hover:bg-amber-400/20" />
              <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm">
                <Trophy className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <TipoSimuladoBadge tipo={s.tipo} />
                </div>
                <h3 className="line-clamp-1 font-semibold leading-snug">{s.titulo}</h3>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {s.participantes} classificados</span>
                  <span className="inline-flex items-center gap-1"><Medal className="h-3.5 w-3.5" /> {s.finalizadas} concluídos</span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
