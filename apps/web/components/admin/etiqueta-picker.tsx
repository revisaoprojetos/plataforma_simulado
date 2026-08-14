'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Tag, Plus, X, Loader2 } from 'lucide-react'
import { aplicarEtiqueta, removerEtiquetaDaQuestao, type Etiqueta } from '@/app/admin/etiquetas/actions'

/**
 * Seletor de etiquetas de UMA questão (usado no editor). Salva cada alteração na hora
 * (aplicar/remover), com atualização otimista — não depende do submit do formulário.
 */
export function EtiquetaPicker({ questaoId, todas, ativasIniciais }: { questaoId: string; todas: Etiqueta[]; ativasIniciais: string[] }) {
  const [ativas, setAtivas] = useState<Set<string>>(new Set(ativasIniciais))
  const [aberto, setAberto] = useState(false)
  const [pending, start] = useTransition()

  const mapa = new Map(todas.map((e) => [e.id, e]))
  const ativasList = [...ativas].map((id) => mapa.get(id)).filter((e): e is Etiqueta => !!e)
  const disponiveis = todas.filter((e) => !ativas.has(e.id))

  function toggle(id: string, add: boolean) {
    setAtivas((p) => { const n = new Set(p); if (add) n.add(id); else n.delete(id); return n })
    start(async () => {
      const r = add ? await aplicarEtiqueta(questaoId, id) : await removerEtiquetaDaQuestao(questaoId, id)
      if (!r.ok) {
        setAtivas((p) => { const n = new Set(p); if (add) n.delete(id); else n.add(id); return n }) // reverte
        toast.error(r.error ?? 'Erro ao salvar etiqueta.')
      }
    })
  }

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Tag className="h-4 w-4" /></span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Etiquetas</p>
          <p className="text-[11px] text-muted-foreground">Rótulos da questão (ex.: desatualizada). Salvo automaticamente.</p>
        </div>
        {pending && <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {ativasList.map((e) => (
          <span key={e.id} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: `${e.cor ?? '#64748b'}22`, color: e.cor ?? '#64748b' }}>
            <Tag className="h-3 w-3" /> {e.nome}
            <button type="button" onClick={() => toggle(e.id, false)} title="Remover" className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"><X className="h-3 w-3" /></button>
          </span>
        ))}
        {ativasList.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma etiqueta.</span>}

        <div className="relative">
          <button type="button" onClick={() => setAberto((v) => !v)} className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary">
            <Plus className="h-3 w-3" /> Etiqueta
          </button>
          {aberto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
              <div className="absolute left-0 top-full z-20 mt-1 max-h-60 w-56 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
                {disponiveis.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">Todas aplicadas. Crie novas em Etiquetas.</p>
                ) : (
                  disponiveis.map((e) => (
                    <button key={e.id} type="button" onClick={() => { toggle(e.id, true); setAberto(false) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.cor ?? '#64748b' }} /> {e.nome}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <a href="/admin/etiquetas" className="mt-2.5 inline-block text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Gerenciar etiquetas →</a>
    </div>
  )
}
