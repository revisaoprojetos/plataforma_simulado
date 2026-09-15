'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, FolderPlus } from 'lucide-react'
import { EditarPastaDialog } from '@/components/admin/editar-pasta-dialog'

/** Seta de voltar ao lado do título (só dentro de uma pasta). Volta um nível (histórico). */
export function VoltarSimulados({ pastaId }: { pastaId?: string | null }) {
  const router = useRouter()
  if (!pastaId) return null
  return (
    <button type="button" onClick={() => router.back()} title="Voltar" aria-label="Voltar"
      className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground">
      <ChevronLeft className="h-5 w-5" />
    </button>
  )
}

/** Botão "Nova pasta"/"Nova subpasta" (ao lado do "Novo simulado"). Cria no nível atual (paiId = pasta). */
export function NovaPastaBtn({ pastaId }: { pastaId?: string | null }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-muted">
        <FolderPlus className="h-4 w-4" /> {pastaId ? 'Nova subpasta' : 'Nova pasta'}
      </button>
      {aberto && (
        <EditarPastaDialog area="simulado" paiId={pastaId ?? null}
          onClose={() => setAberto(false)} onSaved={() => { setAberto(false); router.refresh() }} />
      )}
    </>
  )
}
