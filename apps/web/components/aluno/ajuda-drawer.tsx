'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { HelpCircle, X, ChevronDown, Lightbulb, ArrowUpRight, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GUIAS_ALUNO } from '@/lib/ajuda/guias-aluno'

const KEYFRAMES = `@keyframes ajudaSlideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`

/** Botão "?" (topbar) que abre a AJUDA como BARRA LATERAL (drawer deslizante), sobre a tela. */
export function AjudaDrawer() {
  const [aberto, setAberto] = useState(false)
  const [guia, setGuia] = useState<string>(GUIAS_ALUNO[0].id)

  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [aberto])

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} title="Ajuda" aria-label="Ajuda"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[color:var(--sidebar-accent)]">
        <HelpCircle className="h-5 w-5" />
      </button>

      {aberto && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[110]">
          <style>{KEYFRAMES}</style>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setAberto(false)} />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l bg-card text-foreground shadow-2xl"
            style={{ animation: 'ajudaSlideIn .28s cubic-bezier(.2,.7,.2,1)' }}>
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary"><HelpCircle className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">Ajuda</p>
                <p className="truncate text-[11px] leading-tight text-muted-foreground">Passo a passo do portal</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </header>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {GUIAS_ALUNO.map((g) => {
                const on = guia === g.id
                return (
                  <div key={g.id} className="overflow-hidden rounded-xl border bg-card">
                    <button type="button" onClick={() => setGuia(on ? '' : g.id)}
                      className="flex w-full items-center gap-2.5 p-3 text-left transition-colors hover:bg-muted/50">
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', on ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}><g.icon className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-tight">{g.titulo}</p>
                        <p className="truncate text-xs text-muted-foreground">{g.resumo}</p>
                      </div>
                      <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', on && 'rotate-180')} />
                    </button>

                    {on && (
                      <div className="space-y-3 border-t p-3">
                        {g.link && (
                          <Link href={g.link.href} onClick={() => setAberto(false)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90">
                            {g.link.label} <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                        <ol className="space-y-3">
                          {g.passos.map((p, i) => (
                            <li key={i} className="flex gap-2.5">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary tabular-nums">{i + 1}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-snug">{p.t}</p>
                                <p className="text-sm text-muted-foreground">{p.d}</p>
                                {p.dica && (
                                  <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                                    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{p.dica}</span>
                                  </div>
                                )}
                                <Captura guia={g.id} passo={i + 1} />
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )
              })}
              <p className="pt-1 text-center text-[11px] text-muted-foreground">Ainda com dúvida? Fale com o suporte da sua plataforma. 💬</p>
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  )
}

function Captura({ guia, passo }: { guia: string; passo: number }) {
  const arquivo = `ajuda/aluno-${guia}-${passo}.png`
  const [erro, setErro] = useState(false)
  const [zoom, setZoom] = useState(false)
  // Sem captura ainda → não mostra placeholder (fica limpo). Basta soltar o PNG que ele aparece.
  if (erro) return null
  return (
    <>
      <button type="button" onClick={() => setZoom(true)} title="Ampliar imagem"
        className="group relative mt-2 block w-full overflow-hidden rounded-lg border shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/${arquivo}`} alt={`Passo ${passo}`} onError={() => setErro(true)} className="w-full cursor-zoom-in" />
        <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Maximize2 className="h-3.5 w-3.5" />
        </span>
      </button>

      {zoom && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setZoom(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/${arquivo}`} alt={`Passo ${passo}`} onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] max-w-[95vw] cursor-zoom-out rounded-lg shadow-2xl" />
          <button type="button" onClick={() => setZoom(false)} aria-label="Fechar"
            className="absolute right-4 top-4 rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"><X className="h-5 w-5" /></button>
        </div>,
        document.body,
      )}
    </>
  )
}
