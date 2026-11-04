'use client'

// Tira uma questão (DELETE /api/aluno/cadernos/questao) ou, com `itemId`, um item/comentário
// (DELETE /api/aluno/cadernos/item) do caderno e recarrega a lista.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'

export function RemoverDoCaderno({ cadernoId, questaoId, itemId }: { cadernoId: string; questaoId?: string; itemId?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function remover() {
    if (busy) return
    setBusy(true)
    try {
      const url = itemId
        ? `/api/aluno/cadernos/item?caderno_id=${encodeURIComponent(cadernoId)}&item_id=${encodeURIComponent(itemId)}`
        : `/api/aluno/cadernos/questao?caderno_id=${encodeURIComponent(cadernoId)}&questao_id=${encodeURIComponent(questaoId ?? '')}`
      const r = await fetch(url, { method: 'DELETE' })
      if (r.ok) router.refresh()
    } finally { setBusy(false) }
  }
  return (
    <button type="button" onClick={remover} disabled={busy}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-60">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} {itemId ? 'Remover' : 'Tirar do caderno'}
    </button>
  )
}
