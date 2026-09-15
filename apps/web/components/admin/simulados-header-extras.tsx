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
      className="-ml-1 mt-0.5 inline-flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground">
      <ChevronLeft className="h-7 w-7" />
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
        className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground">
        <FolderPlus className="h-3.5 w-3.5" /> {pastaId ? 'Nova subpasta' : 'Nova pasta'}
      </button>
      {aberto && (
        <EditarPastaDialog area="simulado" paiId={pastaId ?? null}
          onClose={() => setAberto(false)} onSaved={() => { setAberto(false); router.refresh() }} />
      )}
    </>
  )
}
