'use client'

/**
 * "Mover para…" — escolhe a pasta de destino (Biblioteca). Reusa `listarPastasConteudo` e deixa a
 * ação (moverPasta / moverDocumento) a cargo do chamador via `onMover`.
 */

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Folder, FolderRoot } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { listarPastasConteudo } from '@/app/admin/biblioteca/actions'
import { cn } from '@/lib/utils'

type Pasta = { id: string; nome: string; pai_id: string | null }

export function MoverModal({
  open, onClose, titulo, excluirId, onMover,
}: {
  open: boolean
  onClose: () => void
  titulo: string
  /** Pasta que não pode ser destino (ela mesma) — para mover pastas. */
  excluirId?: string
  onMover: (pastaId: string | null) => Promise<void>
}) {
  const [pastas, setPastas] = useState<Pasta[] | null>(null)
  const [destino, setDestino] = useState<string | null>(null)
  const [movendo, setMovendo] = useState(false)

  useEffect(() => {
    if (!open) return
    setPastas(null); setDestino(null)
    listarPastasConteudo('conteudo').then((ps) => setPastas(ps)).catch(() => setPastas([]))
  }, [open])

  // Flat → lista indentada por profundidade (ordem alfabética dentro de cada pai).
  const itens = useMemo(() => {
    const todas = (pastas ?? []).filter((p) => p.id !== excluirId)
    const porPai = new Map<string | null, Pasta[]>()
    for (const p of todas) { const k = p.pai_id ?? null; const a = porPai.get(k) ?? []; a.push(p); porPai.set(k, a) }
    for (const a of porPai.values()) a.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))
    const out: { p: Pasta; nivel: number }[] = []
    const walk = (pai: string | null, nivel: number) => {
      for (const p of porPai.get(pai) ?? []) { out.push({ p, nivel }); walk(p.id, nivel + 1) }
    }
    walk(null, 0)
    return out
  }, [pastas, excluirId])

  async function confirmar() {
    setMovendo(true)
    try { await onMover(destino); onClose() } finally { setMovendo(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !movendo) onClose() }}>
      <DialogContent showCloseButton className="flex max-h-[80vh] w-[min(520px,calc(100vw-2rem))] max-w-[min(520px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0">
        <div className="border-b px-5 pt-5">
          <DialogTitle className="mb-4">Mover “{titulo}” para…</DialogTitle>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {pastas === null ? (
            <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando pastas…</div>
          ) : (
            <ul className="text-sm">
              <li>
                <button
                  onClick={() => setDestino(null)}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted', destino === null && 'bg-primary/10 font-semibold text-primary')}
                >
                  <FolderRoot className="h-4 w-4" />Raiz da Biblioteca
                </button>
              </li>
              {itens.map(({ p, nivel }) => (
                <li key={p.id}>
                  <button
                    onClick={() => setDestino(p.id)}
                    style={{ paddingLeft: 12 + nivel * 16 }}
                    className={cn('flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left hover:bg-muted', destino === p.id && 'bg-primary/10 font-semibold text-primary')}
                  >
                    <Folder className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{p.nome}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-muted/40 px-5 py-3">
          <button onClick={onClose} disabled={movendo} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50">Cancelar</button>
          <button onClick={confirmar} disabled={movendo} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
            {movendo && <Loader2 className="h-4 w-4 animate-spin" />}Mover
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
