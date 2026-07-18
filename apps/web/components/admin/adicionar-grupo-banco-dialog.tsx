'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type React from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { UsersRound, X, Search, Check, Minus, Loader2, Link2, Unlink, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { vincularGrupoAoBanco, desvincularGrupoDoBanco } from '@/app/admin/banco-questoes/estudantes-actions'

// Linha-guia de árvore (estilo explorador de arquivos): tick horizontal ligando o item à
// linha vertical (border-l) do wrapper-pai. Aplicado nas linhas que estão DENTRO de uma pasta.
const TICK = "relative before:absolute before:content-[''] before:top-1/2 before:-translate-y-1/2 before:left-[-14px] before:h-px before:w-[14px] before:bg-border"

export interface GrupoOpc {
  id: string
  nome: string
  cor: string | null
  membros: number
  vinculado: boolean
  pai_id?: string | null
  is_mestre?: boolean
}

export function AdicionarGrupoBancoDialog({ bancoId, grupos }: { bancoId: string; grupos: GrupoOpc[] }) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const byId = useMemo(() => new Map(grupos.map((g) => [g.id, g])), [grupos])
  const { children, top } = useMemo(() => {
    const m = new Map<string, GrupoOpc[]>()
    const t: GrupoOpc[] = []
    for (const g of grupos) {
      const pai = g.pai_id && byId.has(g.pai_id) ? g.pai_id : null
      if (pai) { const a = m.get(pai) ?? []; a.push(g); m.set(pai, a) } else t.push(g)
    }
    const ordena = (arr: GrupoOpc[]) => arr.sort((a, b) => Number(!!b.is_mestre) - Number(!!a.is_mestre) || a.nome.localeCompare(b.nome))
    for (const a of m.values()) ordena(a)
    ordena(t)
    return { children: m, top: t }
  }, [grupos, byId])

  // Grupos comuns (folhas) dentro de uma pasta, em qualquer nível.
  const folhasDe = (id: string): GrupoOpc[] => {
    const out: GrupoOpc[] = []
    const stack = [...(children.get(id) ?? [])]
    while (stack.length) { const n = stack.pop()!; if (n.is_mestre) { const c = children.get(n.id); if (c) stack.push(...c) } else out.push(n) }
    return out
  }

  const q = busca.trim().toLowerCase()

  function toggle(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function togglePasta(pastaId: string) {
    const ids = folhasDe(pastaId).map((f) => f.id)
    const todos = ids.length > 0 && ids.every((id) => sel.has(id))
    setSel((p) => { const n = new Set(p); ids.forEach((id) => (todos ? n.delete(id) : n.add(id))); return n })
  }

  function desvincular(id: string, nome: string) {
    start(async () => {
      const r = await desvincularGrupoDoBanco(bancoId, id)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao desvincular'); return }
      toast.success(`Grupo "${nome}" desvinculado`); router.refresh()
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
      setOpen(false); setSel(new Set()); router.refresh()
    })
  }

  // Linha de grupo comum (folha). `dentro` = está dentro de uma pasta → ganha a linha-guia.
  function linhaGrupo(g: GrupoOpc, dentro: boolean) {
    const on = sel.has(g.id)
    return (
      <div key={g.id} role="button" tabIndex={0} onClick={() => toggle(g.id)}
        className={cn('flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors', dentro && TICK, on ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
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
  }

  // Nó da árvore (pasta ou grupo). `dentro` = filho de outra pasta → ganha a linha-guia.
  function renderNo(g: GrupoOpc, dentro: boolean): React.ReactElement | null {
    if (!g.is_mestre) return linhaGrupo(g, dentro)
    const folhas = folhasDe(g.id)
    const ids = folhas.map((f) => f.id)
    const marcados = ids.filter((id) => sel.has(id)).length
    const totalMembros = folhas.reduce((s, f) => s + f.membros, 0)
    const filhos = children.get(g.id) ?? []
    return (
      <div key={g.id} className="space-y-1.5">
        <div role="button" tabIndex={0} onClick={() => togglePasta(g.id)}
          className={cn('flex w-full cursor-pointer items-center gap-3 rounded-lg bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted', dentro && TICK)}>
          <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', marcados === 0 ? 'border-muted-foreground/40' : 'border-primary bg-primary text-primary-foreground')}>
            {marcados > 0 && (marcados === ids.length ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />)}
          </span>
          <Folder className="h-4 w-4 shrink-0" style={{ color: g.cor ?? 'var(--muted-foreground)' }} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{g.nome}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{ids.length} grupo(s) · {totalMembros} membro(s)</span>
        </div>
        {/* Linha vertical do nível (border-l) + itens filhos com tick horizontal. */}
        <div className="ml-[18px] space-y-1.5 border-l border-border pl-[14px]">
          {filhos.length === 0
            ? <p className={cn('py-1 text-xs text-muted-foreground', TICK)}>Pasta vazia.</p>
            : filhos.map((c) => renderNo(c, true))}
        </div>
      </div>
    )
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
              <p className="mb-3 text-xs text-muted-foreground">Marque uma <strong>pasta</strong> para selecionar todos os grupos dentro dela (em qualquer nível) — e desmarque os que não devem entrar. Novos membros de cada grupo entram no banco <strong>automaticamente</strong>.</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar grupo…" className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>

            <div className="scroll-claro mt-3 min-h-0 flex-1 space-y-2 overflow-auto px-5 pb-2">
              {grupos.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhum grupo cadastrado.</p>
              ) : q ? (
                // Busca: lista plana só de grupos comuns que casam.
                (() => {
                  const res = grupos.filter((g) => !g.is_mestre && g.nome.toLowerCase().includes(q))
                  return res.length === 0
                    ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum grupo encontrado.</p>
                    : res.map((g) => linhaGrupo(g, false))
                })()
              ) : (
                top.map((g) => renderNo(g, false))
              )}
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
