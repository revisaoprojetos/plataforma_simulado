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
import { Plus, Loader2, ListChecks, PenLine, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { OCULTAR_DISCURSIVA } from '@/lib/flags'
import { criarBanco } from '@/app/admin/banco-questoes/actions'

export function NovoBancoForm() {
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<'objetiva' | 'discursiva'>('objetiva')
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      toast.error('Digite um nome para o banco.')
      return
    }
    start(async () => {
      const r = await criarBanco(nome, tipo)
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

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome-banco">Nome do banco</Label>
              <Input
                id="nome-banco"
                autoFocus
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="ex.: Direito Constitucional 2025"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo do banco</Label>
              <div className="grid grid-cols-2 gap-2">
                {([['objetiva', ListChecks, 'Objetiva'], ['discursiva', PenLine, 'Discursiva']] as const)
                  .filter(([val]) => !OCULTAR_DISCURSIVA || val !== 'discursiva')
                  .map(([val, Icon, label]) => (
                    <button key={val} type="button" onClick={() => setTipo(val)}
                      className={cn('flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors', tipo === val ? 'border-primary bg-primary/5 text-primary' : 'hover:border-primary/40')}>
                      <Icon className="h-4 w-4" /> {label}
                      {tipo === val && <Check className="ml-auto h-4 w-4" />}
                    </button>
                  ))}
              </div>
              <p className="text-xs text-muted-foreground">Define o tipo das questões deste banco. O simulado criado a partir dele já herda esse tipo.</p>
            </div>
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
