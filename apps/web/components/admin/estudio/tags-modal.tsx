'use client'

/**
 * "Adicionar tag" (Tags.png) — tags (etiquetas N:N) de um DOCUMENTO da Biblioteca.
 * Admin-only: o aluno não vê. Reusa as ações novas de ./biblioteca/actions (get-or-create por tenant).
 */

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Tag } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { TagPill } from '@/components/admin/estudio/conteudo-ui'
import {
  etiquetasDoDocumento, listarEtiquetasConteudo, salvarEtiquetasDocumento,
} from '@/app/admin/conteudos/materiais/biblioteca/actions'
import type { EtiquetaConteudo } from '@/app/admin/conteudos/materiais/biblioteca/tipos'

export function TagsModal({
  open, onClose, documentoId, titulo, subtitulo, onSalvo,
}: {
  open: boolean
  onClose: () => void
  documentoId: string
  titulo: string
  subtitulo?: string
  onSalvo?: () => void
}) {
  const [nomes, setNomes] = useState<string[]>([])
  const [catalogo, setCatalogo] = useState<EtiquetaConteudo[]>([])
  const [entrada, setEntrada] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setCarregando(true); setEntrada('')
    Promise.all([etiquetasDoDocumento(documentoId), listarEtiquetasConteudo()])
      .then(([doDoc, cat]) => { setNomes(doDoc.map((t) => t.nome)); setCatalogo(cat) })
      .catch(() => { setNomes([]); setCatalogo([]) })
      .finally(() => setCarregando(false))
  }, [open, documentoId])

  function adicionar(nome: string) {
    const n = nome.trim().slice(0, 60)
    if (!n) return
    setNomes((prev) => (prev.some((x) => x.toLowerCase() === n.toLowerCase()) ? prev : [...prev, n]))
    setEntrada('')
  }
  function remover(nome: string) {
    setNomes((prev) => prev.filter((x) => x !== nome))
  }

  async function salvar() {
    setSalvando(true)
    try {
      const r = await salvarEtiquetasDocumento(documentoId, nomes)
      if (!r.ok) { toast.error(r.error || 'Falha ao salvar as tags.'); return }
      toast.success('Tags salvas.')
      onSalvo?.()
      onClose()
    } finally { setSalvando(false) }
  }

  const sugestoes = catalogo.filter((c) => !nomes.some((n) => n.toLowerCase() === c.nome.toLowerCase()))

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="flex max-h-[85vh] w-[min(560px,calc(100vw-2rem))] max-w-[min(560px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0">
        <div className="border-b px-5 pt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Materiais › Tags</p>
          <DialogTitle className="mt-1 mb-4 flex items-center gap-2"><Tag className="h-5 w-5 text-primary" />Adicionar tag</DialogTitle>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-start gap-3 rounded-xl border bg-muted/30 p-3">
            <Tag className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{titulo}</div>
              {subtitulo && <div className="truncate text-xs text-muted-foreground">{subtitulo}</div>}
            </div>
          </div>

          {carregando ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
          ) : (
            <>
              <label className="mb-1 block text-sm font-semibold text-foreground">Tags</label>
              <input
                ref={inputRef}
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(entrada) } }}
                placeholder="Digite e aperte Enter"
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              />

              {nomes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {nomes.map((n) => <TagPill key={n} nome={n} onRemover={() => remover(n)} />)}
                </div>
              )}

              {sugestoes.length > 0 && (
                <div className="mt-4">
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">Usadas recentemente</div>
                  <div className="flex flex-wrap gap-2">
                    {sugestoes.slice(0, 20).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => adicionar(s.nome)}
                        className="rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        {s.nome}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="mt-4 text-xs text-muted-foreground">
                As tags servem para filtrar a lista de materiais e montar listas de revisão da equipe. O aluno não vê.
              </p>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-muted/40 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">Cancelar</button>
          <button
            onClick={salvar}
            disabled={salvando || carregando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}Salvar tags
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
