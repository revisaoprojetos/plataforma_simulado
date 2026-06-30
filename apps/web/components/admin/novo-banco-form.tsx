'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { criarBanco } from '@/app/admin/banco-questoes/actions'

export function NovoBancoForm() {
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState('')
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      toast.error('Digite um nome para o banco.')
      return
    }
    start(async () => {
      const r = await criarBanco(nome)
      if (r.ok) {
        // Recarrega a lista de forma garantida (router.refresh é instável aqui).
        window.location.reload()
      } else {
        toast.error(r.error ?? 'Erro ao criar')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" />
        Criar banco
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Novo banco</DialogTitle>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label htmlFor="nome-banco">Nome do banco</Label>
            <Input
              id="nome-banco"
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex.: Direito Constitucional 2025"
            />
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
