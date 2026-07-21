'use client'

import { useMemo, useState, useTransition } from 'react'
import type React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { BancoCard } from '@/components/admin/banco-card'
import { EditarPastaDialog } from '@/components/admin/editar-pasta-dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { moverBancoParaPasta, excluirPastaFolder, duplicarPastaFolder } from '@/app/admin/banco-questoes/actions'
import { iconeBanco } from '@/lib/banco-visual'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { Database, Search, FolderPlus, Folder, FolderOpen, ChevronLeft, MoreVertical, Trash2, X, Check, Loader2, FolderInput, Palette, Copy } from 'lucide-react'

type Banco = { id: string; nome: string; total: number; estudantes?: number; cor?: string | null; icone?: string | null; capa?: string | null; tipo?: string | null }
type Pasta = { id: string; nome: string; cor?: string | null; icone?: string | null; capa?: string | null; count: number }
type Destino = { id: string; nome: string }

export function BancosGrid({ bancos, folders = [], destinos = [], atual = null }: {
  bancos: Banco[]; folders?: Pasta[]; destinos?: Destino[]; atual?: { id: string; nome: string } | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busca, setBusca] = useState('')
  const [movendo, setMovendo] = useState<Banco | null>(null)
  const [editandoPasta, setEditandoPasta] = useState<Pasta | null>(null)
  const [criandoPasta, setCriandoPasta] = useState(false)

  const q = busca.trim().toLowerCase()
  const bancosF = useMemo(() => (q ? bancos.filter((b) => b.nome.toLowerCase().includes(q)) : bancos), [bancos, q])
  const foldersF = useMemo(() => (q ? folders.filter((f) => f.nome.toLowerCase().includes(q)) : folders), [folders, q])

  // O diálogo de confirmação abre FORA da transition (senão o setState do pop-up é adiado).
  async function excluirPasta(f: Pasta) {
    if (!(await confirmar({ mensagem: `Excluir a pasta "${f.nome}"? Os bancos dentro dela voltam para a raiz (não são apagados).`, destrutivo: true }))) return
    start(async () => {
      const r = await excluirPastaFolder(f.id)
      if (r.ok) { toast.success('Pasta excluída'); router.refresh() } else toast.error(r.error ?? 'Erro')
    })
  }
  function duplicarPasta(f: Pasta) {
    start(async () => {
      const r = await duplicarPastaFolder(f.id)
      if (r.ok) { toast.success('Pasta duplicada'); router.refresh() } else toast.error(r.error ?? 'Erro ao duplicar')
    })
  }

  const podeMover = destinos.length > 0 || !!atual
  const vazio = bancos.length === 0 && folders.length === 0

  return (
    <div className="space-y-4">
      {/* Breadcrumb / ações + busca */}
      <div className="flex flex-wrap items-center gap-2">
        {atual ? (
          <Link href="/admin/banco-questoes" className="inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted">
            <ChevronLeft className="h-4 w-4" /> Todas as pastas
          </Link>
        ) : (
          <button type="button" onClick={() => setCriandoPasta(true)}
            className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-muted">
            <FolderPlus className="h-4 w-4" /> Nova pasta
          </button>
        )}
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={atual ? `Buscar em “${atual.nome}”…` : 'Buscar banco ou pasta…'} className="pl-9" />
        </div>
      </div>

      {atual && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="h-4 w-4" /> <span className="font-medium text-foreground">{atual.nome}</span> — {bancos.length} banco(s)
        </div>
      )}

      {vazio ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Database className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">{atual ? 'Pasta vazia. Mova bancos para cá pelo menu “Mover para pasta”.' : 'Nenhum banco ainda. Crie o primeiro em “Criar banco”.'}</p>
        </div>
      ) : bancosF.length === 0 && foldersF.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">Nada encontrado para “{busca}”.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Pastas (só na raiz) + divisória entre pastas e bancos */}
          {!atual && foldersF.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2"><Folder className="h-4 w-4 text-muted-foreground" /><h2 className="font-semibold">Pastas</h2><span className="text-sm text-muted-foreground">({foldersF.length})</span></div>
              <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {foldersF.map((f) => <FolderCard key={f.id} f={f} onExcluir={() => excluirPasta(f)} onPersonalizar={() => setEditandoPasta(f)} onDuplicar={() => duplicarPasta(f)} />)}
              </div>
            </div>
          )}
          {/* Bancos */}
          {bancosF.length > 0 && (
            <div className="space-y-3">
              {!atual && <div className="flex items-center gap-2"><Database className="h-4 w-4 text-muted-foreground" /><h2 className="font-semibold">Bancos</h2><span className="text-sm text-muted-foreground">({bancosF.length})</span></div>}
              <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {bancosF.map((b) => <BancoCard key={b.id} {...b} onMover={podeMover ? () => setMovendo(b) : undefined} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {movendo && <MoverBancoDialog banco={movendo} destinos={destinos} atualId={atual?.id ?? null} onClose={() => setMovendo(null)} />}
      {editandoPasta && (
        <EditarPastaDialog
          pasta={{ id: editandoPasta.id, nome: editandoPasta.nome, cor: editandoPasta.cor ?? null, icone: editandoPasta.icone ?? null, capa: editandoPasta.capa ?? null }}
          onClose={() => setEditandoPasta(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {criandoPasta && (
        <EditarPastaDialog area="banco" onClose={() => setCriandoPasta(false)} onSaved={() => router.refresh()} />
      )}
    </div>
  )
}

/** Card de PASTA (folder) — imagem/cor + nome + quantos bancos tem dentro. Clicar abre a pasta. */
function FolderCard({ f, onExcluir, onPersonalizar, onDuplicar }: { f: Pasta; onExcluir: () => void; onPersonalizar: () => void; onDuplicar: () => void }) {
  const c = f.cor ?? '#6d28d9'
  const Icon = iconeBanco(f.icone)
  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      {f.capa ? (
        <img src={f.capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
      )}
      {!f.capa && <Icon className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
      <Link href={`/admin/banco-questoes?pasta=${f.id}`} className="absolute inset-0 z-10" aria-label={f.nome} />
      <div className="pointer-events-none absolute left-3 top-3 z-20">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ring-1 ring-white/20" style={{ background: c }}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="absolute right-2 top-2 z-30">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 outline-none transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50" aria-label="Ações da pasta">
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem render={<Link href={`/admin/banco-questoes?pasta=${f.id}`} />}><FolderOpen className="mr-2 h-4 w-4" /> Abrir</DropdownMenuItem>
            <DropdownMenuItem onClick={onPersonalizar}><Palette className="mr-2 h-4 w-4" /> Personalizar</DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicar}><Copy className="mr-2 h-4 w-4" /> Duplicar</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExcluir} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir pasta</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">Pasta</p>
        <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{f.nome}</h3>
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
          <Folder className="h-3 w-3" /> {f.count} banco(s)
        </span>
      </div>
    </div>
  )
}

function MoverBancoDialog({ banco, destinos, atualId, onClose }: { banco: Banco; destinos: Destino[]; atualId: string | null; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [sel, setSel] = useState<string | null>(atualId)

  function salvar() {
    start(async () => {
      const r = await moverBancoParaPasta(banco.id, sel)
      if (r.ok) { toast.success(sel ? 'Movido para a pasta' : 'Movido para a raiz'); router.refresh(); onClose() } else toast.error(r.error ?? 'Erro ao mover')
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><FolderInput className="h-4 w-4" /> Mover “{banco.nome}”</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-auto p-4">
          <Opcao ativo={sel === null} onClick={() => setSel(null)} icon={<Database className="h-4 w-4 text-muted-foreground" />} label="Raiz (sem pasta)" />
          {destinos.length === 0 && <p className="px-1 py-2 text-center text-xs text-muted-foreground">Nenhuma pasta criada ainda.</p>}
          {destinos.map((d) => (
            <Opcao key={d.id} ativo={sel === d.id} onClick={() => setSel(d.id)} icon={<Folder className="h-4 w-4 text-muted-foreground" />} label={d.nome} />
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button type="button" onClick={salvar} disabled={pending || sel === atualId}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Mover
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Opcao({ ativo, onClick, icon, label }: { ativo: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors', ativo ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
        {ativo && <Check className="h-3 w-3" />}
      </span>
      {icon}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
    </button>
  )
}
