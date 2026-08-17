'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { ChevronRight, Lightbulb, ArrowUpRight, Play, Sparkles } from 'lucide-react'
import { GUIAS_ALUNO } from '@/lib/ajuda/guias-aluno'
import { TOURS_ALUNO } from '@/lib/ajuda/tours-aluno'
import { iniciarTourGuia } from '@/components/aluno/guia-tour-runner'

export function AjudaAluno({ gamAtivo = false }: { gamAtivo?: boolean }) {
  // Esconde os guias só-gamificação (ex.: Trilha/Ligas/XP) quando ela está desativada.
  const guias = GUIAS_ALUNO.filter((g) => !g.gamOnly || gamAtivo)
  const [selId, setSelId] = useState<string>(guias[0].id)
  const sel = guias.find((g) => g.id === selId) ?? guias[0]

  return (
    <div className="flex flex-col gap-6 lg:h-full lg:min-h-0 lg:flex-row">
      {/* Índice (barra lateral) — igual ao admin */}
      <nav className="space-y-3 lg:h-full lg:max-h-[calc(100vh-12rem)] lg:min-h-0 lg:w-[260px] lg:shrink-0 lg:overflow-y-auto lg:pr-1">
        {/* CTA: tour COMPLETO guiado pela Capi. */}
        <button type="button" onClick={() => iniciarTourGuia('completo')}
          className="group flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.12] via-card to-card p-3 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Sparkles className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold leading-tight">Conheça o portal</span>
            <span className="block text-[11px] leading-snug text-muted-foreground">Tour guiado ao vivo com a Capi</span>
          </span>
          <Play className="h-4 w-4 shrink-0 fill-current text-primary" />
        </button>
        <div className="space-y-1 rounded-2xl border bg-card p-3">
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Guias</p>
          {guias.map((g) => (
            <button key={g.id} type="button" onClick={() => setSelId(g.id)}
              className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition',
                g.id === selId ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted')}>
              <g.icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{g.titulo}</span>
              {g.id === selId && <ChevronRight className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      </nav>

      {/* Conteúdo do guia — painel com rolagem própria */}
      <div key={sel.id} className="min-w-0 rounded-2xl border bg-muted/20 lg:h-full lg:max-h-[calc(100vh-12rem)] lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <div className="p-3 sm:p-4">
          <article className="min-w-0 space-y-6">
            <header className="flex items-start gap-3 rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-sm"><sel.icon className="h-6 w-6" /></span>
              <div>
                <h2 className="text-xl font-bold tracking-tight">{sel.titulo}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{sel.resumo}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {TOURS_ALUNO[sel.id] && (
                    <button type="button" onClick={() => iniciarTourGuia(sel.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
                      <Play className="h-4 w-4 fill-current" /> Iniciar passo a passo
                    </button>
                  )}
                  {sel.link && (
                    <Link href={sel.link.href} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-muted">
                      {sel.link.label} <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            </header>

            <ol className="space-y-5">
              {sel.passos.map((p, i) => (
                <li key={i} className="relative rounded-2xl border bg-card p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold leading-snug">{p.t}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{p.d}</p>
                      {p.dica && (
                        <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" /> <span>{p.dica}</span>
                        </div>
                      )}
                      <Captura guia={sel.id} passo={i + 1} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </article>
        </div>
      </div>
    </div>
  )
}

/**
 * Captura de tela do passo, por convenção de nome: `public/ajuda/aluno-<guia>-<n>.png`.
 * Enquanto o arquivo não existe, mostra um placeholder com o nome exato a adicionar.
 */
function Captura({ guia, passo }: { guia: string; passo: number }) {
  const arquivo = `ajuda/aluno-${guia}-${passo}.png`
  const [erro, setErro] = useState(false)
  // Sem captura ainda → não mostra nada (fica limpo). Basta soltar o PNG que ele aparece.
  if (erro) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/${arquivo}`} alt={`Passo ${passo}`} onError={() => setErro(true)} className="mt-3 w-full rounded-xl border shadow-sm" />
}
