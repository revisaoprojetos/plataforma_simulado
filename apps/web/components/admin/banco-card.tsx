'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FolderOpen, Pencil, Trash2, Copy, ExternalLink, MoreVertical, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { renomearBanco, excluirBanco, duplicarBanco } from '@/app/admin/banco-questoes/actions'

export function BancoCard({ id, nome, total }: { id: string; nome: string; total: number }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(nome)
  const [confirmar, setConfirmar] = useState(false)
  const [pending, start] = useTransition()

  function salvar() {
    if (!valor.trim() || valor.trim() === nome) { setEditando(false); return }
    start(async () => {
      const r = await renomearBanco(id, valor)
      if (r.ok) window.location.reload()
      else toast.error(r.error ?? 'Erro')
    })
  }

  function copiar() {
    start(async () => {
      const r = await duplicarBanco(id)
      if (r.ok) window.location.reload()
      else toast.error(r.error ?? 'Erro')
    })
  }

  function excluir() {
    start(async () => {
      const r = await excluirBanco(id)
      if (r.ok) window.location.reload()
      else toast.error(r.error ?? 'Erro')
    })
  }

  return (
    <Card className="group relative">
      <CardContent className="p-4">
        {editando ? (
          <div className="flex items-center gap-1.5">
            <Input value={valor} autoFocus onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(false) }} className="h-8" />
            <Button size="icon-sm" variant="ghost" onClick={salvar} disabled={pending}><Check className="h-4 w-4" /></Button>
            <Button size="icon-sm" variant="ghost" onClick={() => { setValor(nome); setEditando(false) }}><X className="h-4 w-4" /></Button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <Link href={`/admin/banco-questoes/${id}`} className="flex min-w-0 flex-1 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FolderOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{nome}</p>
                <p className="text-xs text-muted-foreground">{total} {total === 1 ? 'questão' : 'questões'}</p>
              </div>
            </Link>

            {confirmar ? (
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-xs text-muted-foreground">Excluir?</span>
                <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={excluir} disabled={pending}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => setConfirmar(false)}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Ações do banco"
                >
                  <MoreVertical className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem render={<Link href={`/admin/banco-questoes/${id}`} />}>
                    <ExternalLink className="mr-2 h-4 w-4" /> Abrir
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEditando(true)}>
                    <Pencil className="mr-2 h-4 w-4" /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={copiar}>
                    <Copy className="mr-2 h-4 w-4" /> Copiar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setConfirmar(true)} className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
