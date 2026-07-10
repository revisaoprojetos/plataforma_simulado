'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Lightbulb, ArrowUpRight, ImageIcon, ChevronRight } from 'lucide-react'
import { GUIAS, type GuiaAjuda } from '@/lib/ajuda/guias'
import { cn } from '@/lib/utils'

const CATEGORIAS = ['Simulados', 'Conteúdo', 'Pessoas', 'Análise', 'Cadernos'] as const

export function AjudaTutoriais() {
  const [selId, setSelId] = useState<string>(GUIAS[0]?.id ?? '')
  const sel = GUIAS.find((g) => g.id === selId) ?? GUIAS[0]

  return (
    <div className="flex flex-col gap-6 lg:h-full lg:min-h-0 lg:flex-row">
      {/* Índice — fixo; rola só internamente se ficar longo */}
      <nav className="lg:h-full lg:max-h-[calc(100vh-11rem)] lg:min-h-0 lg:w-[260px] lg:shrink-0 lg:overflow-y-auto lg:pr-1">
        <div className="space-y-4 rounded-2xl border bg-card p-3">
          {CATEGORIAS.map((cat) => {
            const guias = GUIAS.filter((g) => g.categoria === cat)
            if (!guias.length) return null
            return (
              <div key={cat} className="space-y-1">
                <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{cat}</p>
                {guias.map((g) => (
                  <button key={g.id} type="button" onClick={() => setSelId(g.id)}
                    className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition',
                      g.id === selId ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted')}>
                    <g.icone className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{g.titulo}</span>
                    {g.id === selId && <ChevronRight className="h-4 w-4 shrink-0" />}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </nav>

      {/* Conteúdo do guia — painel com rolagem própria; título e índice ficam fixos */}
      <div key={sel?.id} className="min-w-0 rounded-2xl border bg-muted/20 lg:h-full lg:max-h-[calc(100vh-11rem)] lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <div className="p-3 sm:p-4">
          {sel && <GuiaConteudo guia={sel} />}
        </div>
      </div>
    </div>
  )
}

function GuiaConteudo({ guia }: { guia: GuiaAjuda }) {
  return (
    <article className="min-w-0 space-y-6">
      <header className="flex items-start gap-3 rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-sm"><guia.icone className="h-6 w-6" /></span>
        <div>
          <h2 className="text-xl font-bold tracking-tight">{guia.titulo}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{guia.resumo}</p>
          {guia.link && (
            <Link href={guia.link.href} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90">
              {guia.link.label} <ArrowUpRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </header>

      <ol className="space-y-5">
        {guia.passos.map((p, i) => (
          <li key={i} className="relative rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold leading-snug">{p.titulo}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.texto}</p>
                {p.dica && (
                  <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" /> <span>{p.dica}</span>
                  </div>
                )}
                <Captura guia={guia.id} passo={i + 1} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </article>
  )
}

/**
 * Captura de tela do passo, por convenção de nome: `public/ajuda/<guia>-<n>.png`.
 * Enquanto o arquivo não existe, mostra um placeholder com o nome exato a adicionar.
 */
function Captura({ guia, passo }: { guia: string; passo: number }) {
  const arquivo = `ajuda/${guia}-${passo}.png`
  const src = `/${arquivo}`
  const [erro, setErro] = useState(false)

  if (erro) {
    return (
      <div className="mt-3 flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-8 text-center">
        <ImageIcon className="h-7 w-7 text-muted-foreground/60" />
        <p className="text-xs font-medium text-muted-foreground">Captura de tela deste passo</p>
        <p className="text-[11px] text-muted-foreground/70">Adicione o arquivo <code className="rounded bg-muted px-1 py-0.5">public/{arquivo}</code></p>
      </div>
    )
  }
  return (
    <img src={src} alt={`Passo ${passo}`} onError={() => setErro(true)}
      className="mt-3 w-full rounded-xl border shadow-sm" />
  )
}
