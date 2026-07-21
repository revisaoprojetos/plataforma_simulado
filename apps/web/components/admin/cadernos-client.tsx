'use client'

import { confirmar } from '@/components/ui/confirm-dialog'
import { useMemo, useState, useTransition } from 'react'
import type React from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Loader2, Search, Pencil, Printer, Trash2, NotebookPen, Palette, MoreVertical, Copy, FolderPlus, Folder, FolderOpen, ChevronLeft, FolderInput, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { criarCaderno, excluirCaderno, duplicarCaderno, moverCadernoParaPasta, duplicarPastaCaderno } from '@/app/admin/cadernos/actions'
import { excluirPastaFolder } from '@/app/admin/banco-questoes/actions'
import { iconeBanco } from '@/lib/banco-visual'
import { EditarCadernoDialog } from '@/components/admin/editar-caderno-dialog'
import { EditarPastaDialog } from '@/components/admin/editar-pasta-dialog'
import { cn } from '@/lib/utils'

interface CadernoItem { id: string; nome: string; blocos: number; cor?: string | null; icone?: string | null; capa?: string | null }
type Pasta = { id: string; nome: string; cor?: string | null; icone?: string | null; capa?: string | null; count: number }
type Destino = { id: string; nome: string }

export function CadernosClient({ cadernos, folders = [], destinos = [], atual = null }: {
  cadernos: CadernoItem[]; folders?: Pasta[]; destinos?: Destino[]; atual?: { id: string; nome: string } | null
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState('')
  const [pending, start] = useTransition()
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [duplicando, setDuplicando] = useState<string | null>(null)
  const [editando, setEditando] = useState<CadernoItem | null>(null)
  const [movendo, setMovendo] = useState<CadernoItem | null>(null)
  const [editandoPasta, setEditandoPasta] = useState<Pasta | null>(null)
  const [criandoPasta, setCriandoPasta] = useState(false)

  const q = busca.toLowerCase().trim()
  const cadsF = useMemo(() => (q ? cadernos.filter((c) => c.nome.toLowerCase().includes(q)) : cadernos), [q, cadernos])
  const foldersF = useMemo(() => (q ? folders.filter((f) => f.nome.toLowerCase().includes(q)) : folders), [q, folders])

  function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    start(async () => {
      const r = await criarCaderno(nome.trim(), atual?.id ?? null)
      if (r.ok && r.id) { toast.success('Caderno criado'); setNome(''); setOpen(false); router.push(`/admin/cadernos/${r.id}`) }
      else toast.error(r.error ?? 'Erro ao criar')
    })
  }
  async function excluir(id: string, nm: string) {
    if (!(await confirmar({ mensagem: `Excluir o caderno "${nm}"?`, destrutivo: true }))) return
    setExcluindo(id)
    start(async () => {
      const r = await excluirCaderno(id)
      if (r.ok) { toast.success('Caderno excluído'); router.refresh() } else toast.error(r.error ?? 'Erro ao excluir')
      setExcluindo(null)
    })
  }
  function duplicar(id: string) {
    setDuplicando(id)
    start(async () => {
      const r = await duplicarCaderno(id)
      if (r.ok) { toast.success('Caderno duplicado'); router.refresh() } else toast.error(r.error ?? 'Erro ao duplicar')
      setDuplicando(null)
    })
  }
  // O diálogo de confirmação/exclusão abre FORA da transition (senão o setState do pop-up é adiado).
  async function excluirPasta(f: Pasta) {
    if (!(await confirmar({ mensagem: `Excluir a pasta "${f.nome}"? Os cadernos dentro dela voltam para a raiz (não são apagados).`, destrutivo: true }))) return
    start(async () => { const r = await excluirPastaFolder(f.id); if (r.ok) { toast.success('Pasta excluída'); router.refresh() } else toast.error(r.error ?? 'Erro') })
  }
  function duplicarPasta(f: Pasta) {
    start(async () => { const r = await duplicarPastaCaderno(f.id); if (r.ok) { toast.success('Pasta duplicada'); router.refresh() } else toast.error(r.error ?? 'Erro ao duplicar') })
  }

  const podeMover = destinos.length > 0 || !!atual
  const vazio = cadernos.length === 0 && folders.length === 0

  return (
    <div className="space-y-5">
      {/* Toolbar: nova pasta / breadcrumb + busca + novo caderno */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {atual ? (
          <Link href="/admin/cadernos" className="inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted"><ChevronLeft className="h-4 w-4" /> Todas as pastas</Link>
        ) : (
          <button type="button" onClick={() => setCriandoPasta(true)} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-muted"><FolderPlus className="h-4 w-4" /> Nova pasta</button>
        )}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={atual ? `Buscar em “${atual.nome}”…` : 'Buscar caderno pelo nome…'} className="pl-9" />
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setNome('') }}>
          <DialogTrigger render={<Button />}><Plus className="mr-2 h-4 w-4" /> Novo caderno</DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Novo caderno de prova</DialogTitle>
              <DialogDescription>{atual ? `Será criado dentro da pasta “${atual.nome}”. ` : ''}Dê um nome ao caderno. Você poderá montá-lo em blocos logo em seguida.</DialogDescription>
            </DialogHeader>
            <form onSubmit={criar} className="space-y-4">
              <Input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Simulado AGU — Caderno 1" />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={pending || !nome.trim()}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Criar caderno</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {atual && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="h-4 w-4" /> <span className="font-medium text-foreground">{atual.nome}</span> — {cadernos.length} caderno(s)
        </div>
      )}

      {vazio ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <NotebookPen className="h-8 w-8" />
          <p className="text-sm">{atual ? 'Pasta vazia. Mova cadernos pra cá pelo menu “Mover para pasta”.' : 'Nenhum caderno ainda. Clique em “Novo caderno”.'}</p>
        </div>
      ) : cadsF.length === 0 && foldersF.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-muted-foreground"><p className="text-sm">Nada encontrado para “{busca}”.</p></div>
      ) : (
        <div className="space-y-5">
          {/* Pastas (só na raiz) + divisória entre pastas e cadernos */}
          {!atual && foldersF.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2"><Folder className="h-4 w-4 text-muted-foreground" /><h2 className="font-semibold">Pastas</h2><span className="text-sm text-muted-foreground">({foldersF.length})</span></div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {foldersF.map((f) => <FolderCard key={f.id} f={f} onExcluir={() => excluirPasta(f)} onPersonalizar={() => setEditandoPasta(f)} onDuplicar={() => duplicarPasta(f)} />)}
              </div>
            </div>
          )}
          {/* Cadernos */}
          {cadsF.length > 0 && (
            <div className="space-y-3">
              {!atual && <div className="flex items-center gap-2"><NotebookPen className="h-4 w-4 text-muted-foreground" /><h2 className="font-semibold">Cadernos</h2><span className="text-sm text-muted-foreground">({cadsF.length})</span></div>}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {cadsF.map((c) => (
                  <CadernoCard key={c.id} c={c} busy={excluindo === c.id || duplicando === c.id}
                    onExcluir={() => excluir(c.id, c.nome)} onPersonalizar={() => setEditando(c)} onDuplicar={() => duplicar(c.id)}
                    onMover={podeMover ? () => setMovendo(c) : undefined} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {editando && (
        <EditarCadernoDialog
          caderno={{ id: editando.id, nome: editando.nome, cor: editando.cor ?? null, icone: editando.icone ?? null, capa: editando.capa ?? null, blocos: editando.blocos }}
          onClose={() => setEditando(null)} onSaved={() => router.refresh()} />
      )}
      {editandoPasta && (
        <EditarPastaDialog
          pasta={{ id: editandoPasta.id, nome: editandoPasta.nome, cor: editandoPasta.cor ?? null, icone: editandoPasta.icone ?? null, capa: editandoPasta.capa ?? null }}
          onClose={() => setEditandoPasta(null)} onSaved={() => router.refresh()} />
      )}
      {criandoPasta && (
        <EditarPastaDialog area="caderno" onClose={() => setCriandoPasta(false)} onSaved={() => router.refresh()} />
      )}
      {movendo && <MoverCadernoDialog caderno={movendo} destinos={destinos} atualId={atual?.id ?? null} onClose={() => setMovendo(null)} />}
    </div>
  )
}

function CadernoCard({ c, busy, onExcluir, onPersonalizar, onDuplicar, onMover }: {
  c: CadernoItem; busy: boolean; onExcluir: () => void; onPersonalizar: () => void; onDuplicar: () => void; onMover?: () => void
}) {
  const Icon = iconeBanco(c.icone)
  const cor = c.cor ?? '#6d28d9'
  return (
    <div className="group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      <Link href={`/admin/cadernos/${c.id}`} className="absolute inset-0 z-10" aria-label={c.nome} />
      <div className="relative h-40 overflow-hidden">
        {c.capa ? (
          <img src={c.capa} alt="" className="h-full w-full object-cover object-[center_30%] transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="h-full w-full" style={{ background: `linear-gradient(150deg, ${cor}, ${cor}bb)` }} />
        )}
        {!c.capa && <Icon className="absolute -right-3 -top-3 h-20 w-20 text-white/15" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        <span className="absolute bottom-3 left-4 z-30 flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-md ring-2 ring-white/25" style={{ background: cor }}><Icon className="h-5 w-5" /></span>
        <div className="absolute right-2 top-2 z-30">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg text-white/85 outline-none transition-colors hover:bg-white/20 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50" aria-label="Ações do caderno">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem render={<Link href={`/admin/cadernos/${c.id}`} />}><Pencil className="mr-2 h-4 w-4" /> Editar blocos</DropdownMenuItem>
              <DropdownMenuItem onClick={onPersonalizar}><Palette className="mr-2 h-4 w-4" /> Personalizar</DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicar}><Copy className="mr-2 h-4 w-4" /> Duplicar</DropdownMenuItem>
              {onMover && <DropdownMenuItem onClick={onMover}><FolderInput className="mr-2 h-4 w-4" /> Mover para pasta</DropdownMenuItem>}
              <DropdownMenuItem render={<Link href={`/imprimir/caderno/${c.id}`} target="_blank" />}><Printer className="mr-2 h-4 w-4" /> Imprimir</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onExcluir} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Caderno de prova</p>
          <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${cor}1f`, color: cor }}>{c.blocos} {c.blocos === 1 ? 'bloco' : 'blocos'}</span>
        </div>
        <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-tight" title={c.nome}>{c.nome}</h3>
      </div>
    </div>
  )
}

/** Card de PASTA de cadernos — clicar abre a pasta (?pasta=id). */
function FolderCard({ f, onExcluir, onPersonalizar, onDuplicar }: { f: Pasta; onExcluir: () => void; onPersonalizar: () => void; onDuplicar: () => void }) {
  const c = f.cor ?? '#6d28d9'
  const Icon = iconeBanco(f.icone)
  return (
    <div className="group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      <Link href={`/admin/cadernos?pasta=${f.id}`} className="absolute inset-0 z-10" aria-label={f.nome} />
      <div className="relative h-40 overflow-hidden">
        {f.capa ? (
          <img src={f.capa} alt="" className="h-full w-full object-cover object-[center_30%] transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="h-full w-full" style={{ background: `linear-gradient(150deg, ${c}, ${c}bb)` }} />
        )}
        {!f.capa && <Icon className="absolute -right-3 -top-3 h-20 w-20 text-white/15" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        <span className="absolute bottom-3 left-4 z-30 flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-md ring-2 ring-white/25" style={{ background: c }}><Icon className="h-5 w-5" /></span>
        <div className="absolute right-2 top-2 z-30">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg text-white/85 outline-none transition-colors hover:bg-white/20 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50" aria-label="Ações da pasta"><MoreVertical className="h-4 w-4" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem render={<Link href={`/admin/cadernos?pasta=${f.id}`} />}><FolderOpen className="mr-2 h-4 w-4" /> Abrir</DropdownMenuItem>
              <DropdownMenuItem onClick={onPersonalizar}><Palette className="mr-2 h-4 w-4" /> Personalizar</DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicar}><Copy className="mr-2 h-4 w-4" /> Duplicar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onExcluir} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir pasta</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Pasta</p>
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${c}1f`, color: c }}><Folder className="h-3 w-3" /> {f.count}</span>
        </div>
        <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-tight" title={f.nome}>{f.nome}</h3>
      </div>
    </div>
  )
}

function MoverCadernoDialog({ caderno, destinos, atualId, onClose }: { caderno: CadernoItem; destinos: Destino[]; atualId: string | null; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [sel, setSel] = useState<string | null>(atualId)
  function salvar() {
    start(async () => {
      const r = await moverCadernoParaPasta(caderno.id, sel)
      if (r.ok) { toast.success(sel ? 'Movido para a pasta' : 'Movido para a raiz'); router.refresh(); onClose() } else toast.error(r.error ?? 'Erro ao mover')
    })
  }
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><FolderInput className="h-4 w-4" /> Mover “{caderno.nome}”</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-auto p-4">
          <Opcao ativo={sel === null} onClick={() => setSel(null)} icon={<NotebookPen className="h-4 w-4 text-muted-foreground" />} label="Raiz (sem pasta)" />
          {destinos.length === 0 && <p className="px-1 py-2 text-center text-xs text-muted-foreground">Nenhuma pasta criada ainda.</p>}
          {destinos.map((d) => <Opcao key={d.id} ativo={sel === d.id} onClick={() => setSel(d.id)} icon={<Folder className="h-4 w-4 text-muted-foreground" />} label={d.nome} />)}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button type="button" onClick={salvar} disabled={pending || sel === atualId} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Mover</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Opcao({ ativo, onClick, icon, label }: { ativo: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors', ativo ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{ativo && <Check className="h-3 w-3" />}</span>
      {icon}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
    </button>
  )
}
