'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Library, FolderOpen, ChevronRight } from 'lucide-react'

/** Botão compacto (otimiza a área) que abre um pop-up com os bancos vinculados. */
export function BancosVinculadosPopup({ bancos }: { bancos: { id: string; nome: string }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted/40">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Library className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Bancos vinculados</p>
          <p className="text-xs text-muted-foreground">{bancos.length} banco(s) — clique para ver</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8"><Library className="h-5 w-5 text-primary" /> Bancos vinculados ({bancos.length})</DialogTitle>
          </DialogHeader>
          {bancos.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Não vinculado a nenhum banco.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {bancos.map((b) => (
                <Link key={b.id} href={`/admin/banco-questoes/${b.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1.5 text-sm transition-colors hover:border-primary hover:bg-primary/5">
                  <FolderOpen className="h-3.5 w-3.5 text-primary" /> {b.nome}
                </Link>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
