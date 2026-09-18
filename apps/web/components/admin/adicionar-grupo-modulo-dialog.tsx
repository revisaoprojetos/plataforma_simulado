'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { UsersRound, Search, Check, Link2, ChevronRight, Folder, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

export type GrupoOpc = {
  id: string; nome: string; cor: string | null
  /** Hierarquia (opcional): pasta mestre × grupo comum + pai. Quando presente, o picker vira árvore. */
  is_mestre?: boolean; pai_id?: string | null; membros?: number; origem?: 'guru' | 'curseduca' | null
}

function OrigemBadge({ origem }: { origem?: 'guru' | 'curseduca' | null }) {
  if (origem === 'guru') return <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Guru</span>
  if (origem === 'curseduca') return <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">Curseduca</span>
  return null
}

/** "Adicionar grupo" — picker com a MESMA organização da área de Grupos (pastas mestres → subgrupos),
 * origem/contagem e etiqueta "vinculado" nos já com acesso. Devolve os grupos escolhidos ao pai. */
export function AdicionarGrupoModuloDialog({ grupos, jaMarcados, onSelecionar }: {
  grupos: GrupoOpc[]
  jaMarcados: Set<string>
  onSelecionar: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [abertas, setAbertas] = useState<Set<string>>(new Set())

  const q = busca.trim().toLowerCase()
  const pastas = useMemo(() => grupos.filter((g) => g.is_mestre), [grupos])
  const comuns = useMemo(() => grupos.filter((g) => !g.is_mestre), [grupos])
  const temHierarquia = pastas.length > 0
  const filhosDe = useMemo(() => {
    const m = new Map<string, GrupoOpc[]>()
    for (const g of comuns) { const k = g.pai_id ?? '__soltos__'; (m.get(k) ?? m.set(k, []).get(k)!).push(g) }
    return m
  }, [comuns])
  const match = (g: GrupoOpc) => !q || g.nome.toLowerCase().includes(q)

  function toggle(id: string) {
    if (jaMarcados.has(id)) return
    setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleMuitos(ids: string[]) {
    const livres = ids.filter((id) => !jaMarcados.has(id))
    if (!livres.length) return
    const todosSel = livres.every((id) => sel.has(id))
    setSel((p) => { const n = new Set(p); livres.forEach((id) => (todosSel ? n.delete(id) : n.add(id))); return n })
  }
  function toggleAberta(id: string) { setAbertas((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function adicionar() { onSelecionar([...sel]); setOpen(false); setSel(new Set()) }

  // Linha de um grupo comum (checkbox + cor + nome + origem + contagem + etiqueta vinculado).
  const GrupoLinha = ({ g, indent }: { g: GrupoOpc; indent?: boolean }) => {
    const ja = jaMarcados.has(g.id)
    const on = sel.has(g.id)
    return (
      <div role="button" tabIndex={0} onClick={() => toggle(g.id)}
        className={cn('flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors', indent && 'ml-6', ja ? 'opacity-70' : 'cursor-pointer', on ? 'border-primary bg-primary/5' : !ja && 'hover:border-primary/40')}>
        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', ja ? 'border-green-500 bg-green-500 text-white' : on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
          {(on || ja) && <Check className="h-3 w-3" />}
        </span>
        <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: g.cor ?? 'var(--muted-foreground)' }} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.nome}</span>
        <OrigemBadge origem={g.origem} />
        {typeof g.membros === 'number' && <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{g.membros.toLocaleString('pt-BR')}</span>}
        {ja && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400"><Link2 className="h-3 w-3" /> vinculado</span>}
      </div>
    )
  }

  const soltos = filhosDe.get('__soltos__') ?? []

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSel(new Set()) }}>
      <DialogTrigger render={<Button variant="outline" />}>
        <UsersRound className="mr-2 h-4 w-4" /> Adicionar grupo
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Adicionar grupo com acesso</DialogTitle>
          <DialogDescription>Marque as turmas que participam — organizadas em pastas, como na área de Grupos. Novos membros do grupo entram automaticamente.</DialogDescription>
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
          ) : (!temHierarquia || q) ? (
            // Sem hierarquia OU buscando → lista plana dos grupos comuns que casam.
            (() => {
              const lista = comuns.filter(match)
              if (!lista.length) return <p className="py-8 text-center text-sm text-muted-foreground">Nenhum grupo encontrado.</p>
              return lista.map((g) => <GrupoLinha key={g.id} g={g} />)
            })()
          ) : (
            <>
              {/* Pastas mestres → subgrupos (expansível). */}
              {pastas.map((p) => {
                const filhos = filhosDe.get(p.id) ?? []
                const aberta = abertas.has(p.id)
                const livres = filhos.filter((f) => !jaMarcados.has(f.id)).map((f) => f.id)
                const todosSel = livres.length > 0 && livres.every((id) => sel.has(id))
                const totMembros = filhos.reduce((s, f) => s + (f.membros ?? 0), 0)
                return (
                  <div key={p.id} className="rounded-lg border">
                    <div className="flex items-center gap-2 px-2 py-2">
                      <button type="button" onClick={() => toggleAberta(p.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted">
                        <ChevronRight className={cn('h-4 w-4 transition-transform', aberta && 'rotate-90')} />
                      </button>
                      <button type="button" onClick={() => toggleMuitos(filhos.map((f) => f.id))} disabled={!livres.length}
                        className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border disabled:opacity-40', todosSel ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')} title="Selecionar todos da pasta">
                        {todosSel && <Check className="h-3 w-3" />}
                      </button>
                      <button type="button" onClick={() => toggleAberta(p.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        {aberta ? <FolderOpen className="h-4 w-4 shrink-0 text-primary" /> : <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.nome}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{filhos.length} grupo(s){totMembros > 0 ? ` · ${totMembros.toLocaleString('pt-BR')}` : ''}</span>
                      </button>
                    </div>
                    {aberta && (
                      <div className="space-y-1.5 px-2 pb-2">
                        {filhos.length === 0 ? <p className="ml-6 py-2 text-xs text-muted-foreground">Pasta vazia.</p> : filhos.map((g) => <GrupoLinha key={g.id} g={g} indent />)}
                      </div>
                    )}
                  </div>
                )
              })}
              {/* Grupos soltos (sem pasta). */}
              {soltos.length > 0 && (
                <div className="pt-1">
                  <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sem pasta</p>
                  <div className="space-y-1.5">{soltos.map((g) => <GrupoLinha key={g.id} g={g} />)}</div>
                </div>
              )}
            </>
          )}
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
