'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { UsersRound, X, Search, Check, Loader2, Link2, Unlink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { vincularGrupoAoBanco, desvincularGrupoDoBanco } from '@/app/admin/banco-questoes/estudantes-actions'

export interface GrupoOpc { id: string; nome: string; cor: string | null; membros: number; vinculado: boolean }

export function AdicionarGrupoBancoDialog({ bancoId, grupos }: { bancoId: string; grupos: GrupoOpc[] }) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? grupos.filter((g) => g.nome.toLowerCase().includes(q)) : grupos
  }, [grupos, busca])

  function toggle(id: string) {
    setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function desvincular(id: string, nome: string) {
    start(async () => {
      const r = await desvincularGrupoDoBanco(bancoId, id)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao desvincular'); return }
      toast.success(`Grupo "${nome}" desvinculado`)
      window.location.assign(`/admin/banco-questoes/${bancoId}?tab=estudantes`)
    })
  }

  function vincular() {
    if (sel.size === 0) return
    start(async () => {
      let total = 0
      for (const id of sel) {
        const r = await vincularGrupoAoBanco(bancoId, id)
        if (!r.ok) { toast.error(r.error ?? 'Erro ao vincular grupo'); return }
        total += r.vinculados ?? 0
      }
      toast.success(`${sel.size} grupo(s) vinculado(s) · ${total} estudante(s) ligado(s) ao banco`)
      window.location.assign(`/admin/banco-questoes/${bancoId}?tab=estudantes`)
    })
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UsersRound className="mr-2 h-4 w-4" /> Adicionar grupo
      </Button>

      {open && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="animate-page absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" className="animate-pop relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><UsersRound className="h-4 w-4" /> Vincular grupo ao banco</h3>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            <div className="px-5 pt-4">
              <p className="mb-3 text-xs text-muted-foreground">Os estudantes do grupo são ligados a este banco. Novos membros do grupo passam a ser ligados <strong>automaticamente</strong>.</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar grupo…" className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>

            <div className="scroll-claro mt-3 min-h-0 flex-1 space-y-1.5 overflow-auto px-5 pb-2">
              {filtrados.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhum grupo encontrado.</p>
              ) : filtrados.map((g) => {
                const on = sel.has(g.id)
                return (
                  <div key={g.id} role="button" tabIndex={0} onClick={() => toggle(g.id)}
                    className={cn('flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors', on ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                    <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: g.cor ?? 'var(--muted-foreground)' }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.nome}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{g.membros} membro(s)</span>
                    {g.vinculado ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); desvincular(g.id, g.nome) }} disabled={pending}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-400/50 px-2 py-0.5 text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400" title="Desvincular grupo do banco">
                        <Unlink className="h-3 w-3" /> Desvincular
                      </button>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground"><Link2 className="h-3 w-3" /> vincular</span>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
              <span className="text-sm text-muted-foreground">{sel.size === 0 ? 'Nenhum grupo selecionado' : `${sel.size} grupo(s) selecionado(s)`}</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={vincular} disabled={pending || sel.size === 0}>
                  {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Vincular
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
