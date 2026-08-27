'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Tag, Plus, X, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { aplicarEtiqueta, removerEtiquetaDaQuestao, type Etiqueta } from '@/app/admin/etiquetas/actions'

/**
 * Seletor de etiquetas de UMA questão (usado no editor). Abre um pop-up de seleção múltipla
 * (cartões com a cor + nome) com botão Salvar — aplica/remove tudo de uma vez ao confirmar.
 */
export function EtiquetaPicker({ questaoId, todas, ativasIniciais }: { questaoId: string; todas: Etiqueta[]; ativasIniciais: string[] }) {
  const [ativas, setAtivas] = useState<Set<string>>(new Set(ativasIniciais))
  const [modal, setModal] = useState(false)

  const mapa = new Map(todas.map((e) => [e.id, e]))
  const ativasList = [...ativas].map((id) => mapa.get(id)).filter((e): e is Etiqueta => !!e)

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Tag className="h-4 w-4" /></span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Etiquetas</p>
          <p className="text-[11px] text-muted-foreground">Rótulos da questão (ex.: desatualizada).</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {ativasList.map((e) => (
          <span key={e.id} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: `${e.cor ?? '#64748b'}22`, color: e.cor ?? '#64748b' }}>
            <Tag className="h-3 w-3" /> {e.nome}
          </span>
        ))}
        {ativasList.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma etiqueta.</span>}
      </div>

      <button type="button" onClick={() => setModal(true)}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary">
        <Plus className="h-3.5 w-3.5" /> Selecionar etiquetas
      </button>

      {modal && (
        <EtiquetaModal
          questaoId={questaoId}
          todas={todas}
          ativas={ativas}
          onClose={() => setModal(false)}
          onSalvo={(set) => { setAtivas(set); setModal(false) }}
        />
      )}
    </div>
  )
}

function EtiquetaModal({ questaoId, todas, ativas, onClose, onSalvo }: {
  questaoId: string
  todas: Etiqueta[]
  ativas: Set<string>
  onClose: () => void
  onSalvo: (s: Set<string>) => void
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(ativas))
  const [pending, start] = useTransition()

  function toggle(id: string) {
    setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  function salvar() {
    const add = [...sel].filter((id) => !ativas.has(id))
    const rem = [...ativas].filter((id) => !sel.has(id))
    if (add.length === 0 && rem.length === 0) { onClose(); return }
    start(async () => {
      const rs = await Promise.all([
        ...add.map((id) => aplicarEtiqueta(questaoId, id)),
        ...rem.map((id) => removerEtiquetaDaQuestao(questaoId, id)),
      ])
      const falhou = rs.find((r) => !r.ok)
      if (falhou) { toast.error(falhou.error ?? 'Erro ao salvar etiquetas.'); return }
      toast.success('Etiquetas atualizadas.')
      onSalvo(new Set(sel))
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Tag className="h-4 w-4" /> Etiquetas da questão</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {todas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma etiqueta criada. Crie em <a href="/admin/etiquetas" className="text-primary underline">Etiquetas</a>.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {todas.map((e) => {
                const on = sel.has(e.id)
                return (
                  <button key={e.id} type="button" onClick={() => toggle(e.id)}
                    className={cn('flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition-colors', on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: `${e.cor ?? '#64748b'}22` }}>
                      <span className="h-3 w-3 rounded-full" style={{ background: e.cor ?? '#64748b' }} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.nome}</span>
                    {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-5 py-3.5">
          <a href="/admin/etiquetas" className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Gerenciar etiquetas →</a>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="button" size="sm" onClick={salvar} disabled={pending}>
              {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />} Salvar
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
