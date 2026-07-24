'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ClipboardList, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PendenteItem {
  id: string
  titulo: string
  status: string
  expira: string | null
  iniciado: boolean
}

function fmtData(d: string | null) {
  return d ? format(new Date(d), 'dd/MM/yyyy', { locale: ptBR }) : '—'
}

/**
 * Simulados pendentes do estudante — agora como um CARTÃO clicável que abre um pop-up
 * com a lista completa (em vez de despejar todos os itens direto no perfil).
 */
export function SimuladosPendentesCard({ pendentes }: { pendentes: PendenteItem[] }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!pendentes.length) return null

  return (
    <>
      {/* Cartão-resumo: clique abre o pop-up com todos os pendentes */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-left transition hover:border-amber-500/50 hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <ClipboardList className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">Simulados pendentes ({pendentes.length})</span>
          <span className="block text-xs text-muted-foreground">Atribuídos por matrícula/acesso e ainda não concluídos · clique para ver</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="animate-page absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" className="animate-pop relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/5 px-5 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardList className="h-4 w-4 text-amber-500" /> Simulados pendentes ({pendentes.length})
              </h3>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="px-5 pt-3 text-xs text-muted-foreground">Atribuídos por matrícula/acesso e ainda não concluídos.</p>

            <div className="scroll-claro mt-2 grid min-h-0 flex-1 gap-2 overflow-auto px-5 pb-5 sm:grid-cols-2">
              {pendentes.map((p) => (
                <Link key={p.id} href={`/admin/simulados/${p.id}`} className="flex items-center gap-3 rounded-xl border p-3 transition hover:border-primary hover:bg-primary/5">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', p.iniciado ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground')}>
                    <ClipboardList className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.titulo}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.iniciado ? 'Em andamento' : 'Não iniciado'}{p.expira ? ` · expira ${fmtData(p.expira)}` : ''}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
