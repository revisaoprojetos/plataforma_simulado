'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Loader2, Search, Pencil, Printer, Trash2, NotebookPen, NotebookText } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { criarCaderno, excluirCaderno } from '@/app/admin/cadernos/actions'

interface CadernoItem { id: string; nome: string; blocos: number }

export function CadernosClient({ cadernos }: { cadernos: CadernoItem[] }) {
  const [lista, setLista] = useState<CadernoItem[]>(cadernos)
  const [busca, setBusca] = useState('')
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState('')
  const [pending, start] = useTransition()
  const [excluindo, setExcluindo] = useState<string | null>(null)

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    return q ? lista.filter((c) => c.nome.toLowerCase().includes(q)) : lista
  }, [busca, lista])

  function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    start(async () => {
      const r = await criarCaderno(nome.trim())
      if (r.ok && r.id) {
        setLista((l) => [{ id: r.id!, nome: nome.trim(), blocos: 0 }, ...l])
        toast.success('Caderno criado')
        setNome(''); setOpen(false)
      } else {
        toast.error(r.error ?? 'Erro ao criar')
      }
    })
  }

  function excluir(id: string, nm: string) {
    if (!confirm(`Excluir o caderno "${nm}"?`)) return
    setExcluindo(id)
    start(async () => {
      const r = await excluirCaderno(id)
      if (r.ok) { setLista((l) => l.filter((c) => c.id !== id)); toast.success('Caderno excluído') }
      else toast.error(r.error ?? 'Erro ao excluir')
      setExcluindo(null)
    })
  }

  return (
    <div className="space-y-5">
      {/* Toolbar: busca + novo */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar caderno pelo nome…" className="pl-9" />
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setNome('') }}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 h-4 w-4" /> Novo caderno
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Novo caderno de prova</DialogTitle>
              <DialogDescription>Dê um nome ao caderno. Você poderá montá-lo em blocos logo em seguida.</DialogDescription>
            </DialogHeader>
            <form onSubmit={criar} className="space-y-4">
              <Input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Simulado AGU — Caderno 1" />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={pending || !nome.trim()}>
                  {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Criar caderno
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Grid de cards */}
      {filtrados.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <NotebookPen className="h-8 w-8" />
          <p className="text-sm">{busca ? 'Nenhum caderno encontrado.' : 'Nenhum caderno ainda. Clique em “Novo caderno”.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((c) => (
            <Card key={c.id} className="group animate-pop overflow-hidden">
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <NotebookText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">{c.blocos} bloco(s)</p>
                  </div>
                  <button onClick={() => excluir(c.id, c.nome)} disabled={excluindo === c.id}
                    className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" title="Excluir">
                    {excluindo === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <Link href={`/admin/cadernos/${c.id}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'flex-1')}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                  </Link>
                  <Link href={`/imprimir/caderno/${c.id}`} target="_blank" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
                    <Printer className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
