'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Inbox, PenLine, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CorrecaoCard = {
  id: string
  titulo: string
  status: string
  pend: number
  corr: number
  vis: { cor: string | null; capa: string | null; capaBanner: string | null } | null
}

type Filtro = 'todos' | 'pendentes' | 'emdia'
const FILTROS: { id: Filtro; nome: string }[] = [
  { id: 'todos', nome: 'Todos' },
  { id: 'pendentes', nome: 'Com pendentes' },
  { id: 'emdia', nome: 'Em dia' },
]

/** Grid de cards "pôster" dos simulados discursivos, com busca (título) e filtros. */
export function CorrecaoCards({ cards }: { cards: CorrecaoCard[] }) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    return cards.filter((c) => {
      if (t && !c.titulo.toLowerCase().includes(t)) return false
      if (filtro === 'pendentes' && c.pend === 0) return false
      if (filtro === 'emdia' && c.pend > 0) return false
      return true
    })
  }, [cards, q, filtro])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar simulado…"
            className="h-9 w-full rounded-lg border bg-card pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFiltro(f.id)}
              className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors', filtro === f.id ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
              {f.nome}
            </button>
          ))}
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed py-12 text-center text-muted-foreground">
          <Inbox className="h-8 w-8" />
          <p className="text-sm">Nenhum simulado encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtrados.map((c) => {
            const cor = c.vis?.cor ?? '#6d28d9'
            const capa = c.vis?.capa ?? c.vis?.capaBanner ?? null
            return (
              <Link key={c.id} href={`/admin/correcao/simulado/${c.id}`}
                className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                {capa
                  ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105" />
                  : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />

                <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
                  {c.pend > 0
                    ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-black shadow">{c.pend} pendente{c.pend === 1 ? '' : 's'}</span>
                    : <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">Em dia</span>}
                  <ArrowRight className="h-4 w-4 text-white/80 transition-transform group-hover:translate-x-0.5" />
                </div>

                <div className="relative p-3">
                  <h3 className="line-clamp-2 text-sm font-bold leading-snug text-white drop-shadow">{c.titulo}</h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/90 backdrop-blur-sm"><PenLine className="h-3 w-3" /> Discursivo</span>
                    {c.corr > 0 && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">{c.corr} corr.</span>}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
