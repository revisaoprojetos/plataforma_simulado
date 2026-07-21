'use client'

import { confirmar } from '@/components/ui/confirm-dialog'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Loader2, Search, Pencil, Printer, Trash2, NotebookPen, Palette, MoreVertical, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { criarCaderno, excluirCaderno, duplicarCaderno } from '@/app/admin/cadernos/actions'
import { iconeBanco } from '@/lib/banco-visual'
import { EditarCadernoDialog, type CadernoPatch } from '@/components/admin/editar-caderno-dialog'

interface CadernoItem { id: string; nome: string; blocos: number; cor?: string | null; icone?: string | null; capa?: string | null }

export function CadernosClient({ cadernos }: { cadernos: CadernoItem[] }) {
  const [lista, setLista] = useState<CadernoItem[]>(cadernos)
  const [busca, setBusca] = useState('')
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState('')
  const [pending, start] = useTransition()
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [duplicando, setDuplicando] = useState<string | null>(null)
  const [editando, setEditando] = useState<CadernoItem | null>(null)

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

  async function excluir(id: string, nm: string) {
    if (!(await confirmar({ mensagem: `Excluir o caderno "${nm}"?`, destrutivo: true }))) return
    setExcluindo(id)
    start(async () => {
      const r = await excluirCaderno(id)
      if (r.ok) { setLista((l) => l.filter((c) => c.id !== id)); toast.success('Caderno excluído') }
      else toast.error(r.error ?? 'Erro ao excluir')
      setExcluindo(null)
    })
  }

  function duplicar(id: string) {
    setDuplicando(id)
    start(async () => {
      const r = await duplicarCaderno(id)
      if (r.ok && r.caderno) { setLista((l) => [r.caderno!, ...l]); toast.success('Caderno duplicado') }
      else toast.error(r.error ?? 'Erro ao duplicar')
      setDuplicando(null)
    })
  }

  function aoSalvar(id: string, patch: CadernoPatch) {
    setLista((l) => l.map((c) => (c.id === id ? { ...c, nome: patch.nome, cor: patch.cor, icone: patch.icone, capa: patch.capa } : c)))
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

      {/* Grid de cards pôster */}
      {filtrados.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <NotebookPen className="h-8 w-8" />
          <p className="text-sm">{busca ? 'Nenhum caderno encontrado.' : 'Nenhum caderno ainda. Clique em “Novo caderno”.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtrados.map((c) => {
            const Icon = iconeBanco(c.icone)
            const cor = c.cor ?? '#6d28d9'
            return (
              <div key={c.id} className="group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
                {/* Link cobre o card */}
                <Link href={`/admin/cadernos/${c.id}`} className="absolute inset-0 z-10" aria-label={c.nome} />

                {/* Banda de capa/cor no topo (mais alta → a capa do banco não fica tão cortada) */}
                <div className="relative h-40 overflow-hidden">
                  {c.capa ? (
                    <img src={c.capa} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="h-full w-full" style={{ background: `linear-gradient(150deg, ${cor}, ${cor}bb)` }} />
                  )}
                  {!c.capa && <Icon className="absolute -right-3 -top-3 h-20 w-20 text-white/15" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                  {/* ícone na frente, sobre a capa */}
                  <span className="absolute bottom-3 left-4 z-30 flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-md ring-2 ring-white/25" style={{ background: cor }}><Icon className="h-5 w-5" /></span>
                  {/* menu */}
                  <div className="absolute right-2 top-2 z-30">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg text-white/85 outline-none transition-colors hover:bg-white/20 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50" aria-label="Ações do caderno">
                        {excluindo === c.id || duplicando === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem render={<Link href={`/admin/cadernos/${c.id}`} />}>
                          <Pencil className="mr-2 h-4 w-4" /> Editar blocos
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditando(c)}>
                          <Palette className="mr-2 h-4 w-4" /> Personalizar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicar(c.id)}>
                          <Copy className="mr-2 h-4 w-4" /> Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<Link href={`/imprimir/caderno/${c.id}`} target="_blank" />}>
                          <Printer className="mr-2 h-4 w-4" /> Imprimir
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => excluir(c.id, c.nome)} className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Corpo compacto: rótulo + nº de blocos na MESMA linha (economiza espaço) */}
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Caderno de prova</p>
                    <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${cor}1f`, color: cor }}>
                      {c.blocos} {c.blocos === 1 ? 'bloco' : 'blocos'}
                    </span>
                  </div>
                  <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-tight">{c.nome}</h3>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editando && (
        <EditarCadernoDialog
          caderno={{ id: editando.id, nome: editando.nome, cor: editando.cor ?? null, icone: editando.icone ?? null, capa: editando.capa ?? null, blocos: editando.blocos }}
          onClose={() => setEditando(null)}
          onSaved={(patch) => aoSalvar(editando.id, patch)}
        />
      )}
    </div>
  )
}
