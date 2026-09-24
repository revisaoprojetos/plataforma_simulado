'use client'

import { Trophy, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconeConquista, corConquista } from '@/lib/gamificacao/icones'
import { ConquistaIconeFx } from '@/components/gamificacao/conquista-icone'
import { CONDICAO_LABEL, usaMeta, type ModuloConquistaDef } from '@/lib/leitura/carimbos-tipos'

export type ConquistaModuloView = { def: ModuloConquistaDef; ganho: boolean; ganhoEm: string | null }

/** Coleção das conquistas próprias do módulo (na aba Desempenho): ganhas coloridas, bloqueadas em
 *  cinza com a condição. Mesmo visual das conquistas da plataforma. */
export function ConquistasModuloColecao({ conquistas }: { conquistas: ConquistaModuloView[] }) {
  if (!conquistas.length) return null
  const ganhas = conquistas.filter((c) => c.ganho).length
  const cond = (d: ModuloConquistaDef) => usaMeta(d.condicao.tipo) ? CONDICAO_LABEL[d.condicao.tipo].replace('N', String(d.condicao.meta)) : CONDICAO_LABEL[d.condicao.tipo]
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Trophy className="h-4 w-4" /></span>
        <h3 className="text-sm font-semibold">Conquistas do módulo</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{ganhas}/{conquistas.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {conquistas.map((c) => {
          const cor = c.def.cor || corConquista(c.def.id)
          const Icon = iconeConquista(c.def.icone)
          return (
            <div key={c.def.id} title={c.def.descricao || c.def.titulo}
              className={cn('flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors', !c.ganho && 'bg-muted/30')}
              style={c.ganho ? { borderColor: `color-mix(in oklab, ${cor} 35%, transparent)`, background: `color-mix(in oklab, ${cor} 7%, transparent)` } : undefined}>
              <span className={cn('relative flex h-14 w-14 items-center justify-center overflow-visible rounded-full', !c.ganho && 'bg-muted text-muted-foreground/60')}
                style={c.ganho ? { background: `color-mix(in oklab, ${cor} 18%, transparent)`, color: cor } : undefined}>
                {c.ganho ? <ConquistaIconeFx icone={c.def.icone} /> : <Icon className="h-6 w-6" />}
                {!c.ganho && <Lock className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-background p-0.5 text-muted-foreground" />}
              </span>
              <span className="line-clamp-1 text-xs font-semibold">{c.def.titulo}</span>
              {c.ganho
                ? (c.def.descricao ? <span className="line-clamp-2 text-[11px] text-muted-foreground">{c.def.descricao}</span> : <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Conquistada</span>)
                : <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Lock className="h-3 w-3" /> {cond(c.def)}</span>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
