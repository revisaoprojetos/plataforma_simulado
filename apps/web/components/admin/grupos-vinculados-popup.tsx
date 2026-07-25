'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UsersRound, ChevronRight } from 'lucide-react'

export interface GrupoVinculado { id: string; nome: string; cor: string | null }

/** Botão compacto que abre um pop-up com os grupos de que o aluno é membro (espelha "Bancos vinculados"). */
export function GruposVinculadosPopup({ grupos }: { grupos: GrupoVinculado[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted/40">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><UsersRound className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Grupos vinculados</p>
          <p className="text-xs text-muted-foreground">{grupos.length} grupo(s) — clique para ver</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8"><UsersRound className="h-5 w-5 text-primary" /> Grupos vinculados ({grupos.length})</DialogTitle>
          </DialogHeader>
          {grupos.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Não é membro de nenhum grupo.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {grupos.map((g) => (
                <Link key={g.id} href={`/admin/grupos/${g.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1.5 text-sm transition-colors hover:border-primary hover:bg-primary/5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: g.cor ?? 'var(--muted-foreground)' }} /> {g.nome}
                </Link>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
