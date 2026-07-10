'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { HelpCircle, Search, ChevronRight, ArrowLeft, Lightbulb, ArrowUpRight, Compass } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { GUIAS, guiasDaRota, type GuiaAjuda } from '@/lib/ajuda/guias'
import { useTour } from '@/components/admin/tour-guiado'
import { cn } from '@/lib/utils'

export function AjudaButton() {
  const pathname = usePathname()
  const { iniciar } = useTour()
  const [open, setOpen] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const sel = selId ? GUIAS.find((g) => g.id === selId) ?? null : null
  const contextuais = guiasDaRota(pathname)
  const termo = q.trim().toLowerCase()
  const busca = termo ? GUIAS.filter((g) => `${g.titulo} ${g.resumo} ${g.categoria}`.toLowerCase().includes(termo)) : null
  const resto = GUIAS.filter((g) => !contextuais.includes(g))

  function onOpenChange(v: boolean) {
    setOpen(v)
    if (!v) { setSelId(null); setQ('') }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        className="flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title="Ajuda" aria-label="Central de ajuda">
        <HelpCircle className="h-5 w-5" />
      </SheetTrigger>

      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b p-4 pr-12">
          <SheetTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary"><HelpCircle className="h-4.5 w-4.5" /></span>
            Central de Ajuda
          </SheetTitle>
          <SheetDescription>Guias passo a passo para cada função da plataforma.</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {sel ? (
            <Detalhe guia={sel} onVoltar={() => setSelId(null)} onNavegar={() => onOpenChange(false)}
              onIniciar={() => { onOpenChange(false); iniciar(sel.titulo, sel.tour ?? sel.passos) }} />
          ) : (
            <div className="space-y-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ajuda…"
                  className="w-full rounded-lg border bg-transparent py-2 pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-ring" />
              </div>

              {busca ? (
                busca.length === 0
                  ? <p className="py-8 text-center text-sm text-muted-foreground">Nada encontrado.</p>
                  : <Secao titulo={`Resultados (${busca.length})`} guias={busca} onAbrir={setSelId} />
              ) : (
                <>
                  {contextuais.length > 0 && <Secao titulo="Nesta área" guias={contextuais} onAbrir={setSelId} destaque />}
                  {resto.length > 0 && <Secao titulo={contextuais.length ? 'Mais guias' : 'Todos os guias'} guias={resto} onAbrir={setSelId} />}
                </>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Secao({ titulo, guias, onAbrir, destaque }: { titulo: string; guias: GuiaAjuda[]; onAbrir: (id: string) => void; destaque?: boolean }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      <div className="space-y-2">
        {guias.map((g) => (
          <button key={g.id} type="button" onClick={() => onAbrir(g.id)}
            className={cn('group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:border-primary/40 hover:bg-muted/40',
              destaque && 'border-primary/30 bg-primary/5')}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><g.icone className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-tight">{g.titulo}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{g.resumo}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </div>
  )
}

function Detalhe({ guia, onVoltar, onNavegar, onIniciar }: { guia: GuiaAjuda; onVoltar: () => void; onNavegar: () => void; onIniciar: () => void }) {
  return (
    <div className="space-y-4">
      <button type="button" onClick={onVoltar} className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Todos os guias
      </button>

      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><guia.icone className="h-5 w-5" /></span>
        <div>
          <h2 className="text-lg font-semibold leading-tight">{guia.titulo}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{guia.resumo}</p>
        </div>
      </div>

      {/* Tour guiado em tempo real */}
      <button type="button" onClick={onIniciar}
        className="group flex w-full items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-3 text-left transition hover:border-primary hover:bg-primary/10">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105"><Compass className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight text-primary">Iniciar passo a passo</p>
          <p className="text-xs text-muted-foreground">A gente te guia na tela, mostrando onde clicar.</p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
      </button>

      <ol className="space-y-3">
        {guia.passos.map((p, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary tabular-nums">{i + 1}</span>
            <div className="min-w-0 pt-0.5">
              <p className="font-medium leading-snug">{p.titulo}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{p.texto}</p>
              {p.dica && (
                <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{p.dica}</span>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {guia.link && (
        <Link href={guia.link.href} onClick={onNavegar}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90">
          {guia.link.label} <ArrowUpRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  )
}
