'use client'

// Adaptador do "Registrar atualização" em LOTE: resolve (no servidor) os documentos do alvo — docs e/ou pastas
// (+subpastas, até 1000) — e entrega os ids ao RegistrarAtualizacaoDialog.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { previaLote } from '@/app/admin/biblioteca/lote-actions'
import type { AlvoLote } from '@/app/admin/biblioteca/lote-actions-tipos'
import { RegistrarAtualizacaoDialog } from '@/components/biblioteca/gestao/registrar-atualizacao-dialog'

export function RegistrarAtualizacaoLote({ alvo, onFechar, onDone }: { alvo: AlvoLote; onFechar: () => void; onDone: () => void }) {
  const [ids, setIds] = useState<string[] | null>(null)

  useEffect(() => {
    let vivo = true
    previaLote(alvo).then((r) => {
      if (!vivo) return
      if (!r.ok || r.excedeu || r.docIds.length === 0) {
        toast.error(r.error || (r.excedeu ? 'Mais de 1000 documentos — registre por subpasta.' : 'Nenhum documento na seleção.'))
        onFechar(); return
      }
      setIds(r.docIds)
    }).catch(() => { if (vivo) { toast.error('Falha ao resolver os documentos.'); onFechar() } })
    return () => { vivo = false }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [])

  if (!ids) {
    return (
      <div className="fixed inset-0 z-[140] grid place-items-center bg-black/40">
        <div className="flex items-center gap-2 rounded-xl bg-background px-4 py-3 text-sm shadow-lg"><Loader2 className="h-4 w-4 animate-spin" />Preparando documentos…</div>
      </div>
    )
  }
  return <RegistrarAtualizacaoDialog documentoIds={ids} open onOpenChange={(o) => { if (!o) onFechar() }} onDone={() => { onDone(); onFechar() }} />
}
