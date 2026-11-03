'use client'

// Tira uma questão do caderno (DELETE /api/aluno/cadernos/questao) e recarrega a lista.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'

export function RemoverDoCaderno({ cadernoId, questaoId }: { cadernoId: string; questaoId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function remover() {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch(`/api/aluno/cadernos/questao?caderno_id=${encodeURIComponent(cadernoId)}&questao_id=${encodeURIComponent(questaoId)}`, { method: 'DELETE' })
      if (r.ok) router.refresh()
    } finally { setBusy(false) }
  }
  return (
    <button type="button" onClick={remover} disabled={busy}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-60">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Tirar do caderno
    </button>
  )
}
