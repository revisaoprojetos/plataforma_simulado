'use client'

import { Stamp, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CONDICAO_LABEL, usaMeta, type CarimboDef } from '@/lib/leitura/carimbos-tipos'

export type CarimboAlunoView = { def: CarimboDef; ganho: boolean; ganhoEm: string | null }

/** Coleção de carimbos do módulo no perfil do aluno (igual às conquistas): ganhos coloridos,
 *  bloqueados em cinza com a condição. */
export function CarimbosColecao({ carimbos }: { carimbos: CarimboAlunoView[] }) {
  if (!carimbos.length) return null
  const ganhos = carimbos.filter((c) => c.ganho).length
  const condTexto = (d: CarimboDef) => usaMeta(d.condicao.tipo) ? `${CONDICAO_LABEL[d.condicao.tipo].replace('N', String(d.condicao.meta))}` : CONDICAO_LABEL[d.condicao.tipo]
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400"><Stamp className="h-4 w-4" /></span>
        <h3 className="text-sm font-semibold">Carimbos</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{ganhos}/{carimbos.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {carimbos.map((c) => (
          <div key={c.def.id} title={c.def.texto || c.def.titulo} className={cn('flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors', c.ganho ? 'border-amber-500/30 bg-amber-500/5' : 'bg-muted/30')}>
            <div className={cn('flex h-16 w-16 items-center justify-center', !c.ganho && 'opacity-40 grayscale')}>
              {c.def.url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={c.def.url} alt="" className="h-full w-full object-contain" />
                : <Stamp className="h-8 w-8 text-muted-foreground/50" />}
            </div>
            <span className="line-clamp-1 text-xs font-semibold">{c.def.titulo}</span>
            {c.ganho
              ? (c.def.texto ? <span className="line-clamp-2 text-[11px] text-muted-foreground">{c.def.texto}</span> : <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Conquistado</span>)
              : <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Lock className="h-3 w-3" /> {condTexto(c.def)}</span>}
          </div>
        ))}
      </div>
    </section>
  )
}
