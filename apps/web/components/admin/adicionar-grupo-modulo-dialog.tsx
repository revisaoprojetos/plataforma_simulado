'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { UsersRound, Search, Check, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type GrupoOpc = { id: string; nome: string; cor: string | null }

/** "Adicionar grupo" do MÓDULO — picker plano (busca + checkboxes). Devolve os grupos escolhidos
 * ao pai (onSelecionar) que os adiciona ao acesso; os já com acesso vêm marcados/travados. */
export function AdicionarGrupoModuloDialog({ grupos, jaMarcados, onSelecionar }: {
  grupos: GrupoOpc[]
  jaMarcados: Set<string>
  onSelecionar: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())

  const q = busca.trim().toLowerCase()
  const filtrados = useMemo(() => (q ? grupos.filter((g) => g.nome.toLowerCase().includes(q)) : grupos), [grupos, q])

  function toggle(id: string) {
    if (jaMarcados.has(id)) return
    setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function adicionar() {
    onSelecionar([...sel])
    setOpen(false); setSel(new Set())
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSel(new Set()) }}>
      <DialogTrigger render={<Button variant="outline" />}>
        <UsersRound className="mr-2 h-4 w-4" /> Adicionar grupo
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Adicionar grupo com acesso</DialogTitle>
          <DialogDescription>Marque as turmas que podem acessar este módulo. Novos membros do grupo entram automaticamente.</DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2 pt-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar grupo…" className="pl-9" />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-auto px-6 pb-2">
          {grupos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum grupo cadastrado neste tenant.</p>
          ) : filtrados.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum grupo encontrado.</p>
          ) : filtrados.map((g) => {
            const ja = jaMarcados.has(g.id)
            const on = sel.has(g.id)
            return (
              <div key={g.id} role="button" tabIndex={0} onClick={() => toggle(g.id)}
                className={cn('flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors', ja ? 'opacity-60' : 'cursor-pointer', on ? 'border-primary bg-primary/5' : !ja && 'hover:border-primary/40')}>
                <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', ja ? 'border-green-500 bg-green-500 text-white' : on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                  {(on || ja) && <Check className="h-3 w-3" />}
                </span>
                <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: g.cor ?? 'var(--muted-foreground)' }} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.nome}</span>
                {ja && <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400"><Link2 className="h-3 w-3" /> com acesso</span>}
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-6 py-3">
          <span className="text-sm text-muted-foreground">{sel.size === 0 ? 'Nenhum grupo selecionado' : `${sel.size} selecionado(s)`}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={adicionar} disabled={sel.size === 0}>Adicionar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
