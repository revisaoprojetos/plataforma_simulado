'use client'

import { useEffect } from 'react'
import { X, Database, Check, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'

export type BancoOpcao = { id: string; nome: string; capa?: string | null }

/** Pop-up de seleção de banco de questões — mostra a CAPA de cada banco. */
export function BancoPicker({ open, onClose, bancos, atual, onSelecionar }: {
  open: boolean
  onClose: () => void
  bancos: BancoOpcao[]
  atual: string | null
  onSelecionar: (id: string | null) => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold"><Database className="h-5 w-5 text-primary" /> Escolher banco</h2>
            <p className="text-xs text-muted-foreground">As questões do banco alimentam a prévia.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="scroll-claro flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            <button type="button" onClick={() => { onSelecionar(null); onClose() }}
              className={cn('group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-md', atual === null ? 'border-primary ring-2 ring-primary' : 'hover:border-primary/50')}>
              <div className="flex h-24 items-center justify-center bg-muted/50 text-muted-foreground"><Ban className="h-7 w-7" /></div>
              <div className="border-t px-3 py-2"><p className="text-sm font-semibold leading-tight">Nenhum</p><p className="text-[11px] text-muted-foreground">Prévia com exemplo</p></div>
            </button>
            {bancos.map((b) => {
              const sel = atual === b.id
              return (
                <button key={b.id} type="button" onClick={() => { onSelecionar(b.id); onClose() }}
                  className={cn('group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-md', sel ? 'border-primary ring-2 ring-primary' : 'hover:border-primary/50')}>
                  <div className="relative h-24 bg-muted/50">
                    {b.capa
                      ? <img src={b.capa} alt="" className="h-full w-full object-cover" />
                      : <div className="flex h-full items-center justify-center text-muted-foreground"><Database className="h-7 w-7" /></div>}
                    {sel && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"><Check className="h-4 w-4" /></span>}
                  </div>
                  <div className="border-t px-3 py-2"><p className="truncate text-sm font-semibold leading-tight" title={b.nome}>{b.nome}</p></div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
