'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { criarGrupo, criarGrupoMestre, excluirGrupo, moverGrupo } from '@/app/admin/grupos/actions'
import { pedirTexto, confirmar } from '@/components/ui/confirm-dialog'
import { EditarGrupoDialog } from '@/components/admin/editar-grupo-dialog'
import { SecaoHeader } from '@/components/admin/secao-header'
import { cn } from '@/lib/utils'
import {
  Plus, Users, Pencil, Trash2, Loader2, UsersRound, ChevronRight, ChevronDown,
  Folder, FolderOpen, FolderPlus, FolderInput, X, Check,
} from 'lucide-react'

type Grupo = { id: string; nome: string; membros: number; cor: string | null; is_mestre: boolean; pai_id: string | null }

export function GruposClient({ grupos }: { grupos: Grupo[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editando, setEditando] = useState<Grupo | null>(null)
  const [movendo, setMovendo] = useState<Grupo | null>(null)
  const [expandido, setExpandido] = useState<Set<string>>(() => new Set(grupos.filter((g) => g.is_mestre).map((g) => g.id)))

  const pastas = useMemo(() => grupos.filter((g) => g.is_mestre).sort((a, b) => a.nome.localeCompare(b.nome)), [grupos])
  const porPai = useMemo(() => {
    const m = new Map<string, Grupo[]>()
    for (const g of grupos) {
      if (g.is_mestre) continue
      if (g.pai_id && pastas.some((p) => p.id === g.pai_id)) {
        const arr = m.get(g.pai_id) ?? []; arr.push(g); m.set(g.pai_id, arr)
      }
    }
    for (const arr of m.values()) arr.sort((a, b) => a.nome.localeCompare(b.nome))
    return m
  }, [grupos, pastas])
  // Grupos comuns sem pasta (ou cuja pasta não existe mais) ficam no topo, soltos.
  const soltos = useMemo(
    () => grupos.filter((g) => !g.is_mestre && (!g.pai_id || !pastas.some((p) => p.id === g.pai_id))).sort((a, b) => a.nome.localeCompare(b.nome)),
    [grupos, pastas],
  )
  const totalComuns = grupos.filter((g) => !g.is_mestre).length

  async function novo() {
    const nome = await pedirTexto({ titulo: 'Novo grupo', label: 'Nome do grupo', placeholder: 'ex.: Turma 2026', confirmar: 'Criar' })
    if (!nome) return
    start(async () => { const r = await criarGrupo(nome); if (r.ok) { toast.success('Grupo criado'); router.refresh() } else toast.error(r.error ?? 'Erro ao criar') })
  }
  async function novaPasta() {
    const nome = await pedirTexto({ titulo: 'Nova pasta (grupo mestre)', label: 'Nome da pasta', placeholder: 'ex.: Turmas 2026', confirmar: 'Criar pasta' })
    if (!nome) return
    start(async () => { const r = await criarGrupoMestre(nome); if (r.ok) { toast.success('Pasta criada'); router.refresh() } else toast.error(r.error ?? 'Erro ao criar') })
  }
  async function excluir(g: Grupo) {
    const msg = g.is_mestre
      ? `Excluir a pasta "${g.nome}"? Os grupos dentro dela voltam a ficar soltos (não são apagados).`
      : `Excluir o grupo "${g.nome}"?`
    if (!(await confirmar({ mensagem: msg, destrutivo: true }))) return
    start(async () => { const r = await excluirGrupo(g.id); if (r.ok) { toast.success(g.is_mestre ? 'Pasta excluída' : 'Grupo excluído'); router.refresh() } else toast.error(r.error ?? 'Erro') })
  }
  function toggle(id: string) {
    setExpandido((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const nada = grupos.length === 0

  return (
    <div className="animate-page space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Grupos</h1>
          <p className="text-muted-foreground">Organize grupos de estudantes em pastas (grupos mestre) para atribuir em lote.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={novaPasta} disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-muted disabled:opacity-50">
            <FolderPlus className="h-4 w-4" /> Nova pasta
          </button>
          <button type="button" onClick={novo} disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Novo grupo
          </button>
        </div>
      </div>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={UsersRound} titulo="Grupos cadastrados" subtitulo={`${pastas.length} pasta(s) · ${totalComuns} grupo(s)`} />
        <CardContent className="p-0">
          {nada ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <UsersRound className="h-8 w-8 opacity-40" />
              <p className="text-sm">Nenhum grupo cadastrado.</p>
              <button type="button" onClick={novo} className="text-sm font-medium text-primary hover:underline">Criar o primeiro</button>
            </div>
          ) : (
            <div className="divide-y">
              {pastas.map((p) => {
                const filhos = porPai.get(p.id) ?? []
                const totalMembros = filhos.reduce((s, f) => s + f.membros, 0)
                const aberto = expandido.has(p.id)
                return (
                  <div key={p.id}>
                    <div className="group flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-muted/40">
                      <button type="button" onClick={() => toggle(p.id)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" title={aberto ? 'Recolher' : 'Expandir'}>
                        {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={() => toggle(p.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left font-semibold">
                        {aberto ? <FolderOpen className="h-4 w-4 shrink-0" style={{ color: p.cor ?? 'var(--muted-foreground)' }} /> : <Folder className="h-4 w-4 shrink-0" style={{ color: p.cor ?? 'var(--muted-foreground)' }} />}
                        <span className="truncate">{p.nome}</span>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{filhos.length} grupo(s) · {totalMembros} membro(s)</span>
                      </button>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => setEditando(p)} title="Renomear pasta" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => excluir(p)} title="Excluir pasta" className="rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    {aberto && (
                      <div className="bg-muted/20">
                        {filhos.length === 0 ? (
                          <p className="py-2.5 pl-12 pr-4 text-xs text-muted-foreground">Pasta vazia — mova grupos para cá pelo botão <FolderInput className="mb-0.5 inline h-3 w-3" />.</p>
                        ) : filhos.map((g) => (
                          <GrupoRow key={g.id} g={g} indent onEdit={() => setEditando(g)} onMove={() => setMovendo(g)} onDelete={() => excluir(g)} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {soltos.map((g) => (
                <GrupoRow key={g.id} g={g} onEdit={() => setEditando(g)} onMove={() => setMovendo(g)} onDelete={() => excluir(g)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editando && <EditarGrupoDialog grupo={editando} onClose={() => setEditando(null)} />}
      {movendo && <MoverGrupoDialog grupo={movendo} pastas={pastas} onClose={() => setMovendo(null)} />}
    </div>
  )
}

function GrupoRow({ g, indent, onEdit, onMove, onDelete }: { g: Grupo; indent?: boolean; onEdit: () => void; onMove: () => void; onDelete: () => void }) {
  return (
    <div className={cn('group flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-muted/40', indent && 'pl-12')}>
      <Link href={`/admin/grupos/${g.id}`} className="flex min-w-0 flex-1 items-center gap-2 font-medium hover:text-primary">
        <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: g.cor ?? 'var(--muted-foreground)' }} />
        <span className="truncate">{g.nome}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground"><Users className="h-3.5 w-3.5" /> {g.membros}</span>
      <div className="flex shrink-0 gap-1">
        <button type="button" onClick={onMove} title="Mover para uma pasta" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><FolderInput className="h-4 w-4" /></button>
        <button type="button" onClick={onEdit} title="Editar (nome e cor)" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
        <button type="button" onClick={onDelete} title="Excluir" className="rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  )
}

function MoverGrupoDialog({ grupo, pastas, onClose }: { grupo: Grupo; pastas: Grupo[]; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [sel, setSel] = useState<string | null>(grupo.pai_id ?? null)

  function salvar() {
    start(async () => {
      const r = await moverGrupo(grupo.id, sel)
      if (r.ok) { toast.success(sel ? 'Grupo movido para a pasta' : 'Grupo solto da pasta'); router.refresh(); onClose() }
      else toast.error(r.error ?? 'Erro ao mover')
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="animate-page absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="animate-pop relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><FolderInput className="h-4 w-4" /> Mover “{grupo.nome}”</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="scroll-claro min-h-0 flex-1 space-y-1.5 overflow-auto p-4">
          <Opcao ativo={sel === null} onClick={() => setSel(null)} icon={<UsersRound className="h-4 w-4 text-muted-foreground" />} label="Sem pasta (solto)" />
          {pastas.length === 0 && <p className="px-1 py-2 text-center text-xs text-muted-foreground">Nenhuma pasta criada ainda. Crie uma pasta na tela de grupos.</p>}
          {pastas.map((p) => (
            <Opcao key={p.id} ativo={sel === p.id} onClick={() => setSel(p.id)} icon={<Folder className="h-4 w-4" style={{ color: p.cor ?? 'var(--muted-foreground)' }} />} label={p.nome} />
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button type="button" onClick={salvar} disabled={pending || sel === (grupo.pai_id ?? null)}
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
