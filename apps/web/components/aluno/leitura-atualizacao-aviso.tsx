'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Minus, PencilLine, Plus, Sparkles, X } from 'lucide-react'
import type { DocumentoCarregado } from '@/lib/leitura/acesso'
import type { DiffDoc } from '@/lib/leitura/diff-tipos'
import { DiffEspelho } from '@/components/leitura/diff-espelho'

/**
 * Aviso "esta lei foi atualizada" no leitor do aluno + espelho do que mudou.
 * Flutua via portal (não depende de onde é montado no leitor). O diff é carregado
 * sob demanda ao abrir (rota /api/leitura/alteracoes), comparando a versão publicada
 * anterior com a vigente.
 */
export function LeituraAtualizacaoAviso({ doc }: { doc: DocumentoCarregado }) {
  const [visivel, setVisivel] = useState(true)
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [diff, setDiff] = useState<DiffDoc | null>(null)
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])

  if (!montado || !doc.atualizacao || !visivel) return null

  async function abrir() {
    setAberto(true)
    if (diff) return
    setCarregando(true)
    try {
      const r = await fetch(`/api/leitura/alteracoes?doc=${doc.id}`)
      const j = await r.json()
      if (j?.diff) setDiff(j.diff as DiffDoc)
    } catch {
      /* silencioso — o modal mostra o vazio */
    } finally {
      setCarregando(false)
    }
  }

  const resumo = diff?.resumo

  return createPortal(
    <>
      {/* Pílula flutuante */}
      {!aberto && (
        <div className="fixed inset-x-0 bottom-4 z-[120] flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full border bg-card/95 px-3 py-2 text-sm shadow-lg backdrop-blur">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-medium">Esta lei foi atualizada</span>
            <button onClick={abrir} className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition hover:opacity-90">
              Ver o que mudou
            </button>
            <button onClick={() => setVisivel(false)} className="rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Dispensar">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal do espelho */}
      {aberto && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setAberto(false)}>
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold">O que mudou nesta lei</h2>
                {doc.atualizacao?.descricao && <p className="truncate text-xs text-muted-foreground">{doc.atualizacao.descricao}</p>}
              </div>
              {resumo && (
                <div className="hidden shrink-0 items-center gap-1.5 text-[11px] sm:flex">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300"><PencilLine className="h-3 w-3" />{resumo.mod}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300"><Plus className="h-3 w-3" />{resumo.add}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 font-medium text-rose-700 dark:text-rose-300"><Minus className="h-3 w-3" />{resumo.rem}</span>
                </div>
              )}
              <button onClick={() => setAberto(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {carregando ? (
                <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando o comparativo…</p>
              ) : diff ? (
                <DiffEspelho diff={diff} />
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">Não foi possível carregar as alterações.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
